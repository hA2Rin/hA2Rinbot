// require('dotenv').config(); // 환경 변수를 사용하지 않으므로 주석 처리 (Railway에서 자동 로드)
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

const play = require('play-dl'); // ✅ play-dl 사용

// ⭐️ [추가] play-dl 초기 설정: 스트리밍 안정성 강화 ⭐️
// YouTube의 지역/나이 제한 및 스트림 오류를 우회하기 위한 옵션
play.set('ytdl_options', {
    // 나이 제한 우회: 로그인 없이 18+ 콘텐츠 스트림 허용
    'skip_validation': true,
    // 지역 제한 우회: 특정 국가 제한 영상을 시도할 때 필요
    'force_ipv4': true,
    // 품질 설정: 가장 낮은 오디오 품질을 선택하여 네트워크 부하를 줄임
    'quality': 'lowestaudio'
});

// ------------------------------------
// 🔑 환경 변수 설정
// ------------------------------------
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ------------------------------------
// 🤖 봇 클라이언트 및 인텐트 설정
// ------------------------------------
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
// 🎵 대기열 로직 함수
// ------------------------------------

/**
 * 대기열의 다음 곡을 재생하거나, 대기열이 비었으면 랜덤 곡을 재생합니다.
 * @param {object} guild - Discord Guild 객체
 * @param {object} song - 재생할 노래 객체 ({ title, url })
 */
async function playNext(guild, song) {
    const queue = serverQueue.get(guild.id);

    if (!queue || !queue.songs || queue.songs.length === 0) {

        // --- 🤖 대기열이 비었을 때 랜덤 음악 재생 로직 시작 ---
        const randomKeywords = ["chill music", "pop hits", "lofi beats", "random song"];
        const randomQuery = randomKeywords[Math.floor(Math.random() * randomKeywords.length)];

        try {
            const searchResult = await play.search(randomQuery, { limit: 1 });
            if (searchResult.length > 0) {
                const randomSong = searchResult[0];
                const newSong = {
                    title: randomSong.title,
                    url: randomSong.url,
                };

                // 큐가 존재해야만 랜덤 곡을 추가하고 재시작
                if (queue) {
                    queue.songs.push(newSong);
                    console.log(`[Auto-Play] 대기열이 비어, '${newSong.title}'(으)로 랜덤 재생을 시도합니다.`);
                    return playNext(guild, newSong);
                }
            } else {
                console.log("[Auto-Play] 랜덤 검색에 실패했습니다.");
            }
        } catch (error) {
            console.error(`[Auto-Play Error]: ${error.message}`);
        }

        // 랜덤 재생 실패 또는 큐가 없을 때 연결 종료
        if (queue && queue.connection) {
            queue.connection.destroy();
            serverQueue.delete(guild.id);
            if (queue.textChannel) {
                queue.textChannel.send('✅ 대기열에 곡이 없어 재생을 종료합니다.');
            }
        }
        return;
    }

    // 현재 재생할 곡
    const currentSong = queue.songs[0];


    try {
        // 🚨 URL이 유효한지 먼저 검사하여 'Invalid URL' 오류 방지 (강화)
        if (!currentSong || !currentSong.url || !currentSong.url.startsWith('http')) {
            const errorMessage = `🚨 **${currentSong.title || '알 수 없는 곡'}**의 유효한 URL이 누락되어 재생할 수 없습니다. 다음 곡으로 건너뜁니다.`;
            console.error(`[ERROR] URL 누락 오류: ${errorMessage}`);

            queue.songs.shift(); // 현재 곡 제거
            if (queue.textChannel) {
                queue.textChannel.send(errorMessage);
            }
            return playNext(guild, queue.songs[0]);
        }

        // play-dl.stream을 사용하여 AudioResource를 생성합니다.
        const stream = await play.stream(currentSong.url, {
            discordPlayerCompatibility: true,
        });

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });

        queue.player.play(resource);

        queue.textChannel.send(`🎶 **${currentSong.title}** 재생 시작!`);

    } catch (error) {
        console.error(`[ERROR] 노래 재생 중 오류 발생 (${currentSong.title || '알 수 없는 곡'}):`, error.message);

        // 오류 발생 시 현재 곡 건너뛰고 다음 곡으로 이동
        queue.songs.shift();

        // 오류 메시지를 사용자에게 보냅니다.
        if (queue.textChannel) {
            queue.textChannel.send(`🚨 **${currentSong.title || '알 수 없는 곡'}** 재생 중 오류가 발생했습니다. 다음 곡으로 넘어갑니다. (스트림 오류)`);
        }

        // 대기열에 곡이 남아있다면 다음 곡 재생을 시도
        playNext(guild, queue.songs[0]);
    }
}


// ------------------------------------
// 1. 슬래시 명령어 정의 및 등록 로직
// ------------------------------------

// ⭐️ 필수 명령어 정의 (이 부분이 없으면 봇이 명령어를 인식하지 못합니다)
const commands = [
    new SlashCommandBuilder()
        .setName('재생')
        .setDescription('YouTube에서 노래를 검색하거나 URL을 통해 재생합니다.')
        .addStringOption(option =>
            option.setName('검색어')
                .setDescription('노래 제목 또는 YouTube URL')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('스킵')
        .setDescription('현재 재생 중인 노래를 건너뛰고 다음 노래를 재생합니다.'),

    new SlashCommandBuilder()
        .setName('정지')
        .setDescription('노래 재생을 멈추고 음성 채널에서 나갑니다.'),

    new SlashCommandBuilder()
        .setName('대기열')
        .setDescription('현재 대기열 목록을 확인합니다.'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 봇 로그인 전에 명령어 등록 시도
(async () => {
    try {
        console.log(`🔄 ${commands.length}개의 애플리케이션 명령어를 로드 중...`);

        // 명령어 등록 (GUILD_ID를 사용해 특정 서버에만 등록)
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );

        console.log(`✅ ${data.length}개의 애플리케이션 명령어를 성공적으로 등록했습니다.`);
    } catch (error) {
        console.error('🚨 명령어 등록 오류:', error);
    }
})();


// ------------------------------------
// 2. 봇 이벤트 핸들러
// ------------------------------------

// 봇 온라인 이벤트
client.once('clientReady', () => {
    console.log(`✅ ${client.user.tag} 봇이 온라인입니다!`);
});

// 슬래시 명령어 처리 (/)
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;
    const guildId = interaction.guildId;
    const guild = interaction.guild;
    const queue = serverQueue.get(guildId);


    // ⭐️⭐️⭐️ /재생 명령어 로직 (타임아웃 방지 및 검색 오류 핸들링 강화) ⭐️⭐️⭐️
    if (commandName === '재생') {
        // 🚨 [핵심 수정] 타임아웃 방지를 위해 모든 로직보다 먼저 deferReply 호출
        await interaction.deferReply();

        const input = interaction.options.getString('검색어');
        const channel = interaction.member.voice.channel;

        if (!channel) {
            // deferReply 했으므로 editReply 사용
            return await interaction.editReply('❌ 노래를 재생하려면 음성 채널에 참여해야 합니다.');
        }

        let url = null;
        let title = null;

        try {
            const type = play.validate(input);

            if (type === 'yt_video' || type === 'yt_playlist') {
                // 1. 유효한 YouTube URL인 경우
                url = input;
                const info = await play.video_info(url).catch(e => {
                    console.error("video_info 오류 (URL 입력 시):", e.message);
                    return { video_details: { title: '제목 없음' } };
                });
                title = info.video_details.title;
            } else {
                // 2. 입력이 검색어인 경우
                const searchResults = await play.search(input, { limit: 1 });

                if (!searchResults || searchResults.length === 0) {
                    return await interaction.editReply('❌ 검색 결과가 없습니다.');
                }

                const result = searchResults[0];
                url = result.url;
                title = result.title;
            }

        } catch (e) {
            // 치명적인 검색/URL 처리 오류 발생 시 (이 오류가 3초 전에 나면 이전처럼 뻗음)
            console.error('검색/URL 처리 중 치명적 오류:', e.message);
            return await interaction.editReply('❌ 노래 정보를 가져오는 데 실패했습니다. 다른 검색어로 시도해 주세요.');
        }

        // 🚨 [강화] 최종적으로 URL과 제목의 유효성 검사 
        if (!url || !url.startsWith('http') || !title) {
            console.error(`[ERROR] 최종 URL/제목 누락: Title=${title}, URL=${url}`);
            return await interaction.editReply('❌ 노래 정보를 가져오는 데 실패했습니다. 다른 검색어로 시도해 주세요. (URL 획득 실패)');
        }

        const song = {
            title: title,
            url: url,
        };

        // 큐 로직 시작
        if (!queue) {
            // 큐가 없으면 새로 생성하고 음성 채널에 연결
            const queueContruct = {
                textChannel: interaction.channel,
                voiceChannel: channel,
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

                // 플레이어 상태 이벤트 처리 (노래가 끝나면 다음 곡 재생)
                player.on(AudioPlayerStatus.Idle, () => {
                    if (serverQueue.has(guildId)) {
                        const currentQueue = serverQueue.get(guildId);
                        currentQueue.songs.shift(); // 현재 곡 제거
                        playNext(guild, currentQueue.songs[0]);
                    }
                });

                // 플레이어 오류 처리 추가
                player.on('error', error => {
                    console.error(`[AudioPlayer ERROR] (${song.title}):`, error.message);
                    if (serverQueue.has(guildId)) {
                        // 오류 발생 시 다음 곡으로 넘어가도록 강제 Idle 상태 전환
                        serverQueue.get(guildId).player.stop();
                    }
                });


                // 첫 곡 재생 시작
                playNext(guild, queueContruct.songs[0]);
                await interaction.editReply(`🎶 **${song.title}** (으)로 재생을 시작합니다.`);

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
    // ⭐️⭐️⭐️ /스킵 명령어 로직 ⭐️⭐️⭐️
    else if (commandName === '스킵') {
        await interaction.deferReply();
        if (!interaction.member.voice.channel) return await interaction.editReply('❌ 스킵하려면 음성 채널에 있어야 합니다.');
        if (!queue) return await interaction.editReply('❌ 현재 재생 중인 곡이 없습니다.');

        try {
            // 플레이어를 강제로 멈추면 Idle 이벤트가 발생하여 다음 곡이 재생됨
            queue.player.stop();
            await interaction.editReply('⏩ 현재 곡을 건너뛰고 다음 곡을 재생합니다.');
        } catch (error) {
            console.error('[SKIP Error]', error);
            await interaction.editReply('🚨 스킵 중 오류가 발생했습니다.');
        }
    }

    // ⭐️⭐️⭐️ /정지 명령어 로직 ⭐️⭐️⭐️
    else if (commandName === '정지') {
        await interaction.deferReply();
        if (!interaction.member.voice.channel) return await interaction.editReply('❌ 정지하려면 음성 채널에 있어야 합니다.');
        if (!queue) return await interaction.editReply('❌ 현재 재생 중인 곡이 없습니다.');

        try {
            queue.songs = []; // 대기열 비우기
            queue.player.stop(); // 플레이어 정지 (Idle 이벤트 발생)
            // playNext에서 큐가 비어있는 것을 확인하고 연결을 종료함.

            // 연결 종료를 확실하게 하려면 직접 destroy 호출
            queue.connection.destroy();
            serverQueue.delete(guildId);

            await interaction.editReply('⏹️ 재생을 정지하고 음성 채널에서 나갑니다.');
        } catch (error) {
            console.error('[STOP Error]', error);
            await interaction.editReply('🚨 정지 중 오류가 발생했습니다.');
        }
    }

    // ⭐️⭐️⭐️ /대기열 명령어 로직 ⭐️⭐️⭐️
    else if (commandName === '대기열') {
        await interaction.deferReply();
        if (!queue || queue.songs.length === 0) return await interaction.editReply('❌ 현재 대기열에 곡이 없습니다.');

        let list = queue.songs.map((song, index) => {
            return `${index === 0 ? '➡️ **현재 재생 중**' : `**${index}.**`} ${song.title}`;
        }).join('\n');

        if (list.length > 2000) {
            list = list.substring(0, 1990) + '... (이후 생략)';
        }

        await interaction.editReply(`🎵 **현재 대기열**:\n${list}`);
    }
});


// ------------------------------------
// 3. 봇 로그인
// ------------------------------------
client.login(TOKEN);