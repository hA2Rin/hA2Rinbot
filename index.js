// require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField
} = require('discord.js');

// ⭐️ 노래 봇을 위한 추가 라이브러리 ⭐️
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus
} = require('@discordjs/voice');
const ytdl = require('ytdl-core'); // YouTube 오디오 스트림 추출
const ytsr = require('ytsr'); // YouTube 검색 라이브러리 추가 (npm install ytsr 필요)

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

// 봇 클라이언트 생성 및 필요한 인텐트 설정
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates // 음성 채널 상태 변경 인텐트
    ]
});

// ⭐️ 길드별 상태 관리 (대기열 포함) ⭐️
const serverQueue = new Map(); // Key: Guild ID, Value: { textChannel, connection, player, songs: [] }

// ------------------------------------
// 대기열 로직 함수
// ------------------------------------

/**
 * 대기열의 다음 곡을 재생하거나, 대기열이 비었으면 연결을 종료합니다.
 * @param {object} guild - Discord Guild 객체
 * @param {object} song - 재생할 노래 객체 ({ title, url })
 */
async function playNext(guild, song) {
    const queue = serverQueue.get(guild.id);

    if (!song) {
        // 대기열에 곡이 없으면 연결 해제
        if (queue && queue.connection) {
            queue.connection.destroy();
            serverQueue.delete(guild.id);
            queue.textChannel.send('✅ 대기열에 곡이 없어 재생을 종료합니다.');
        }
        return;
    }

    try {
        // YouTube 오디오 스트림 생성
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            quality: 'lowestaudio',
            highWaterMark: 1 << 25
        });

        const resource = createAudioResource(stream);
        queue.player.play(resource);

        queue.textChannel.send(`🎶 **${song.title}** 재생 시작!`);

    } catch (error) {
        console.error(`[ERROR] 노래 재생 중 오류 발생 (${song.title}):`, error);

        // 오류 발생 시 현재 곡 건너뛰고 다음 곡으로 이동
        queue.songs.shift();
        playNext(guild, queue.songs[0]);

        if (queue.textChannel) {
            queue.textChannel.send(`🚨 **${song.title}** 재생 중 오류가 발생했습니다. 다음 곡으로 넘어갑니다.`);
        }
    }
}


// ------------------------------------
// 1. 슬래시 명령어 정의 및 등록 로직
// ------------------------------------
const commands = [
    // --- 기존 명령어 ---
    new SlashCommandBuilder()
        .setName('server_manager')
        .setDescription('서버 관리자를 보여줍니다.'),

    new SlashCommandBuilder()
        .setName('server')
        .setDescription('현재 서버의 정보를 보여줍니다.'),
    new SlashCommandBuilder()
        .setName('member')
        .setDescription('서버에 있는 총 인원수를 보여줍니다.'),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('지정된 멤버를 서버에서 추방합니다.')
        .addUserOption(option =>
            option
                .setName('대상')
                .setDescription('추방할 서버 멤버를 선택하세요.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('이유')
                .setDescription('추방 사유를 입력하세요.')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),

    // ⭐️ 노래 봇 명령어 추가 ⭐️
    new SlashCommandBuilder()
        .setName('재생') // 명령어 이름을 '재생'으로 설정
        .setDescription('음성 채널에 참여하여 노래를 재생합니다.')
        .addStringOption(option =>
            option
                .setName('검색어') // 옵션 이름을 '검색어'로 설정
                .setDescription('유튜브 링크 또는 검색어를 입력해 주세요.')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('현재 재생 중인 곡을 건너뛰고 대기열의 다음 곡을 재생합니다.'),

    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('현재 대기열 목록을 보여줍니다.'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('음악 재생을 중지하고 대기열을 비웁니다.'),

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 봇 로그인 전에 명령어 등록 시도
(async () => {
    try {
        console.log('[DEPLOY] 슬래시 명령어 등록 중...');

        // 특정 서버(길드)에 명령어 등록
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        console.log(`[SUCCESS] ${data.length}개의 슬래시 명령어 등록 완료!`);
        console.log(`[SUCCESS] 서버 ID ${GUILD_ID}에 반영될 때까지 시간이 걸릴 수 있습니다.`);
    } catch (error) {
        console.error("[ERROR] 슬래시 명령어 등록 실패:", error);
    }
})();

// ------------------------------------
// 2. 봇 이벤트 핸들러
// ------------------------------------

// 봇 온라인 이벤트
client.once('clientReady', () => {
    console.log(`✅ ${client.user.tag} 봇이 온라인입니다!`);
});

// 메시지 기반 명령어 처리 (접두사: !)
client.on('messageCreate', message => {
    // 봇이 보낸 메시지 무시
    if (message.author.bot) return;
    const fullMsg = message.content.normalize('NFC').trim();
    const args = fullMsg.split(/\s+/);
    const command = args[0].toLowerCase();

    const msg = fullMsg.toLowerCase();

    const mentionedUser = message.mentions.users.first();


    // 명령어 처리
    if (msg === '!이우밍') {
        message.channel.send('에겐녀');

    } else if (msg === '!우연이') {
        message.channel.send('바부!');
    }
    else if (msg === '!개발자') {
        message.channel.send('하이린');
    }
    else if (msg === '!좋은') {
        message.channel.send('아침!');
    }
    else if (msg === '!추') {
        // 🚨 멘션하고 싶은 사용자의 실제 ID로 변경하세요.
        const TARGET_USER_ID = '1372920618898686072';

        // 디스코드의 멘션 형식 문자열을 직접 생성합니다.
        const targetMention = `<@${TARGET_USER_ID}>`;

        // 최종 응답 메시지 구성
        const response = `${targetMention} 병신샛기!`;

        message.channel.send(response);
    }
    else if (msg === '!굿나잇') {
        message.channel.send('다들 잘자요!');
    }
    else if (msg === '!베카') {
        message.channel.send('테토남');
    }
    else if (msg === '!이래원') {
        message.channel.send('Monster Rap');
    }
    else if (msg === '!하이린') {
        message.channel.send('행복함 ㅎㅅㅎ');
    }
    else if (msg === '!유지') {
        message.channel.send('바부 멍충이');
    }
    else if (msg === '!k') {
        message.channel.send('바보바보');
    }
    else if (msg === '!크마') {
        message.channel.send('기여움!');
    }
    else if (msg === '!집') {
        message.channel.send('보내줘ㅓㅓ');
    }
    else if (msg === '!잡초') {
        message.channel.send('멘헤라');
    }
    else if (msg === '!페토페토') {
        message.channel.send('포테토칩');
    }
    else if (msg === '!제더') {
        message.channel.send('L입니다');
    }
    else if (msg === '!good night') {
        message.channel.send('모두들 쫀밤!');
    }
    else if (msg === '!아벨') {
        const TARGET_USER_ID = '1331218598391316501';

        // 디스코드의 멘션 형식 문자열을 직접 생성합니다.
        const targetMention = `<@${TARGET_USER_ID}>`;

        // 최종 응답 메시지 구성
        const response = `${targetMention} 하이린만 괴롭히는 당사자`;

        message.channel.send(response);
    }
    else if (msg === '!카나') {
        message.channel.send('누나바라기');
    }
    else if (msg === '!지배인') {
        // 🚨 멘션하고 싶은 사용자의 실제 ID로 변경하세요.
        const TARGET_USER_ID = '1419941829956341792';

        // 디스코드의 멘션 형식 문자열을 직접 생성합니다.
        const targetMention = `<@${TARGET_USER_ID}>`;

        // 최종 응답 메시지 구성
        const response = `${targetMention} 바부 멍충이`;

        message.channel.send(response);
    }

    else if (msg === '!루나') {
        const TARGET_USER_ID = '1225777165728219268';

        // 디스코드의 멘션 형식 문자열을 직접 생성합니다.
        const targetMention = `<@${TARGET_USER_ID}>`;

        // 최종 응답 메시지 구성
        const response = `${targetMention} 바부 멍충이`;

        message.channel.send(response);
    }
    else if (msg === '!하루') {
        message.channel.send('하루룽 목소리 개조음!');
    }
    else if (msg === '!칸쵸') {
        message.channel.send('만취개냥이');
    }
    else if (msg === '!직구') {
        message.channel.send('직꾸꾸');
    }
    else if (msg === '!부지배인') {
        message.channel.send('바부지만 지배인보다는 덜 바부임ㅎㅋㅎㅋㅎ');
    }
    else if (msg === '!에') {
        message.channel.send('지배인바부');
    }
});

// 슬래시 명령어 처리 (/)
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;
    const guildId = interaction.guildId;
    const guild = interaction.guild;
    const queue = serverQueue.get(guildId);


    // ⭐️⭐️⭐️ 음악 봇 로직 (대기열 & 검색) ⭐️⭐️⭐️
    if (commandName === '재생') {
        await interaction.deferReply();
        const input = interaction.options.getString('검색어');
        const channel = interaction.member.voice.channel;

        if (!channel) {
            return await interaction.editReply('❌ 노래를 재생하려면 음성 채널에 참여해야 합니다.');
        }

        let url;
        let title;

        try {
            if (ytdl.validateURL(input)) {
                // 입력이 유효한 URL인 경우
                url = input;
            } else {
                // 입력이 검색어인 경우
                const filters = await ytsr.getFilters(input);
                const filter = filters.get('Type').get('Video');
                const searchResults = await ytsr(filter.url, { limit: 1 });

                if (!searchResults.items || searchResults.items.length === 0) {
                    return await interaction.editReply('❌ 검색 결과가 없습니다.');
                }
                url = searchResults.items[0].url;
            }

            const songInfo = await ytdl.getInfo(url);
            title = songInfo.videoDetails.title;

        } catch (e) {
            console.error('검색/URL 처리 오류:', e);
            return await interaction.editReply('❌ 검색 또는 URL 처리 중 오류가 발생했습니다. 유효한 YouTube URL이나 검색어를 입력해주세요.');
        }


        const song = {
            title: title,
            url: url,
        };

        if (!queue) {
            // 큐가 없으면 새로 생성하고 음성 채널에 연결
            const queueContruct = {
                textChannel: interaction.channel,
                connection: null,
                player: null,
                songs: [],
            };

            serverQueue.set(guildId, queueContruct);
            queueContruct.songs.push(song);

            try {
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guildId,
                    adapterCreator: guild.voiceAdapterCreator,
                });

                queueContruct.connection = connection;

                const player = createAudioPlayer();
                queueContruct.player = player;
                connection.subscribe(player);

                // 연결 상태 이벤트 처리
                connection.on(VoiceConnectionStatus.Disconnected, () => {
                    if (serverQueue.has(guildId)) {
                        serverQueue.delete(guildId);
                    }
                });

                // 플레이어 상태 이벤트 처리 (노래가 끝나면 다음 곡 재생)
                player.on(AudioPlayerStatus.Idle, () => {
                    if (serverQueue.has(guildId)) {
                        const currentQueue = serverQueue.get(guildId);
                        currentQueue.songs.shift(); // 현재 곡 제거
                        playNext(guild, currentQueue.songs[0]);
                    }
                });

                // 첫 곡 재생 시작
                playNext(guild, queueContruct.songs[0]);
                await interaction.editReply(`🎶 **${song.title}** 재생 시작!`);

            } catch (err) {
                console.error('음성 연결 오류:', err);
                serverQueue.delete(guildId);
                return await interaction.editReply('🚨 음성 채널 연결 중 오류가 발생했습니다.');
            }
        } else {
            // 큐가 있으면 대기열에 곡 추가
            queue.songs.push(song);
            await interaction.editReply(`➕ **${song.title}**을(를) 대기열에 추가했습니다!`);
        }
    }
    else if (commandName === 'stop') {
        if (!queue) {
            return await interaction.reply('봇이 음성 채널에 연결되어 있지 않습니다.');
        }
        if (queue.connection) {
            queue.connection.destroy(); // 연결 종료
        }
        serverQueue.delete(guildId); // 상태 정보 및 대기열 삭제
        await interaction.reply('🛑 재생을 중지하고 대기열을 비웠습니다.');
    }
    else if (commandName === 'skip') {
        if (!queue) {
            return await interaction.reply('❌ 현재 재생 중인 곡이 없습니다.');
        }
        if (queue.songs.length > 1) {
            queue.songs.shift(); // 현재 곡 제거
            playNext(guild, queue.songs[0]); // 다음 곡 재생 시작
            await interaction.reply('⏭️ 현재 곡을 건너뛰고 다음 곡을 재생합니다.');
        } else {
            // 마지막 곡이면 stop과 동일하게 처리
            if (queue.connection) {
                queue.connection.destroy();
            }
            serverQueue.delete(guildId);
            await interaction.reply('✅ 대기열에 곡이 없어 재생을 종료합니다.');
        }
    }
    else if (commandName === 'queue') {
        if (!queue || queue.songs.length === 0) {
            return await interaction.reply('ℹ️ 현재 대기열에 노래가 없습니다.');
        }

        let response = '🎵 **현재 노래 대기열** 🎵\n';
        queue.songs.forEach((song, index) => {
            response += `**${index === 0 ? '▶️ 현재 재생: ' : `${index}. `}** ${song.title}\n`;
        });

        await interaction.reply(response);
    }
    // ⭐️⭐️⭐️ 음악 봇 로직 종료 ⭐️⭐️⭐️


    // ... 기존 슬래시 명령어 로직 (server_manager, server, member, kick) ...
    else if (commandName === 'server_manager') {

        await interaction.deferReply();
        const guild = interaction.guild;

        if (!guild) {
            return await interaction.editReply('이 명령어는 서버 내에서만 사용할 수 있습니다.');
        }

        try {

            const membersCollection = await interaction.guild.members.fetch({
                withPresences: true,
                limit: 1000
            }).catch(error => {
                console.warn('멤버 로딩 중 오류 발생. 캐시된 멤버 사용:', error.code);
                return interaction.guild.members.cache;
            });


            const members = Array.from(membersCollection.values());


            const managerRoles = guild.roles.cache.filter(role =>
                role.name.includes('한울 크레파스') || role.name.includes('별빛 크레용')
            );


            const trueAdminMembers = members.filter(member =>
                member.permissions.has(PermissionsBitField.Flags.Administrator) && !member.user.bot
            );


            const roleBasedManagers = members.filter(member => {
                const hasSpecificRole = managerRoles.some(role => member.roles.cache.has(role.id));
                const hasAdminPermission = member.permissions.has(PermissionsBitField.Flags.Administrator);


                return hasSpecificRole && !hasAdminPermission && !member.user.bot;
            });

            let response = `👑 **[${guild.name}] 서버 관리자 현황** 👑\n\n`;


            response += `**✨ 한울 크레파스 (${trueAdminMembers.length}명):**\n`;
            if (trueAdminMembers.length > 0) {

                response += trueAdminMembers.map(member => `- ${member.displayName}`).join('\n');
            } else {
                response += '없음\n';
            }
            response += '\n';


            response += `**💫 별빛 크레용 (${roleBasedManagers.length}명):**\n`;

            if (roleBasedManagers.length > 0) {

                response += roleBasedManagers.map(member => `- ${member.displayName}`).join('\n');
            } else {
                response += '없음\n';
            }

            await interaction.editReply(response);

        } catch (error) {
            console.error('관리자 목록 불러오기 오류:', error);
            await interaction.editReply('🚨 관리자 목록을 가져오는 중 오류가 발생했습니다. (봇의 권한 인텐트 확인 요망)');
        }
    }
    else if (commandName === 'server') {
        await interaction.reply(`서버 이름: **${interaction.guild.name}**\n총 멤버 수: **${interaction.guild.memberCount}**명`);
    }
    else if (commandName === 'member') {
        await interaction.reply(`\n멤버 수: **${interaction.guild.memberCount}**명`);
    }
    else if (interaction.commandName === 'kick') {

        await interaction.deferReply({ ephemeral: true });


        const targetUser = interaction.options.getUser('대상');
        const reason = interaction.options.getString('이유') || '사유없음';

        try {

            const targetMember = await interaction.guild.members.fetch(targetUser.id);


            if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.KickMembers)) {

                return await interaction.editReply({ content: '❌ 봇에게 멤버를 추방할 권한이 없습니다.', ephemeral: true });
            }


            if (targetMember.kickable === false) {

                return await interaction.editReply({ content: '❌ 봇이 이 멤버보다 역할이 낮거나 동등하여 추방할 수 없습니다.', ephemeral: true });
            }


            await targetMember.kick(reason);


            await interaction.editReply({
                content: `✅ **${targetUser.tag}** 님을 추방했습니다. (사유: ${reason})`,
                ephemeral: false
            });
        } catch (error) {
            console.error(error);

            await interaction.editReply({ content: '🚨 멤버 추방 중 오류가 발생했습니다.', ephemeral: true });
        }
    }

});

// ------------------------------------
// 3. 봇 로그인
// ------------------------------------
client.login(TOKEN);