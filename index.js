//require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

// 봇 클라이언트 생성 및 필요한 인텐트 설정
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers 
    ]
});

// ------------------------------------
// 1. 슬래시 명령어 정의 및 등록 로직
// ------------------------------------
const commands = [
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
        .addUserOption(option => // ⬅️ 멤버 옵션 (정상)
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
        // 명령어 사용 권한 설정
        .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)

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
        message.channel.send('병신샛기!');
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
        message.channel.send('점점 삶의 희망이 없어지는중');
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

    if (commandName === 'server_manager') {
       
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