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

// const ytdl = require('ytdl-core'); // ❌ YTDL-CORE 제거
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


const TOKEN = process.env.DISCORD_TOKEN;
// 🚨 수정: Railway 변수 Key에 맞게 변경 (DISCORD_ 접두사 제거)
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// 봇 클라이언트 생성 및 필요한 인텐트 설정
// ... (client 설정 코드는 그대로 유지)

// ⭐️ 길드별 상태 관리 (대기열 포함) ⭐️
const serverQueue = new Map(); // Key: Guild ID, Value: { textChannel, connection, player, songs: [] }

// ------------------------------------
// 대기열 로직 함수
// ------------------------------------

/**
 * 대기열의 다음 곡을 재생하거나, 대기열이 비었으면 랜덤 곡을 재생합니다.
 * @param {object} guild - Discord Guild 객체
 * @param {object} song - 재생할 노래 객체 ({ title, url })
 */
async function playNext(guild, song) {
    const queue = serverQueue.get(guild.id);

    if (!queue || !queue.songs || queue.songs.length === 0) {

        // --- 🤖 [수정] 대기열이 비어있을 때 랜덤 음악 재생 로직 시작 ---

        // 1. 랜덤 재생 키워드 정의
        const randomKeywords = ["chill music", "pop hits", "lofi beats", "random song"];
        const randomQuery = randomKeywords[Math.floor(Math.random() * randomKeywords.length)];

        try {
            // 2. 랜덤 검색 수행
            const searchResult = await play.search(randomQuery, { limit: 1 });
            if (searchResult.length > 0) {
                const randomSong = searchResult[0];
                const newSong = {
                    title: randomSong.title,
                    url: randomSong.url,
                };

                // 3. 찾은 곡을 대기열에 추가하고 재생 시작
                queue.songs.push(newSong);
                console.log(`[Auto-Play] 대기열이 비어, '${newSong.title}'(으)로 랜덤 재생을 시도합니다.`);
                // 재귀적으로 playNext를 호출하여 재생을 시작합니다.
                return playNext(guild, newSong); // 새로 추가된 곡으로 재생 재시작
            } else {
                console.log("[Auto-Play] 랜덤 검색에 실패했습니다. 연결을 종료합니다.");
                // 랜덤 검색에도 실패했다면 기존 로직(연결 종료)으로 넘어갑니다.
            }
        } catch (error) {
            console.error(`[Auto-Play Error]: ${error.message}`);
            // 오류가 발생해도 기존 로직(연결 종료)으로 넘어갑니다.
        }

        // --- 🤖 [수정] 대기열이 비어있을 때 랜덤 음악 재생 로직 끝 (연결 종료) ---

        // 기존 로직: 대기열이 비어있으면 연결 해제 (랜덤 재생 실패 시 실행됨)
        if (queue && queue.connection) {
            queue.connection.destroy();
            serverQueue.delete(guild.id);
            // '대기열에 곡이 없어 재생을 종료합니다.' 메시지는 stop 명령어에서만 사용하도록 제거 (랜덤 재생 시에는 중복될 수 있음)
        }
        return;
    }

    // 현재 재생할 곡 (함수 인자로 받은 곡, 또는 큐의 첫 번째 곡)
    const currentSong = queue.songs[0];


    try {
        // 🚨 수정된 로직: URL이 유효한지 먼저 검사하여 'Invalid URL' 오류 방지
        if (!currentSong.url || !currentSong.url.startsWith('http')) {
            const errorMessage = `🚨 **${currentSong.title || '알 수 없는 곡'}**의 유효한 URL이 누락되어 재생할 수 없습니다. 다음 곡으로 건너뜁니다.`;
            console.error(`[ERROR] URL 누락 오류: ${errorMessage}`);

            queue.songs.shift(); // 현재 곡 제거
            playNext(guild, queue.songs[0]);
            if (queue.textChannel) {
                queue.textChannel.send(errorMessage);
            }
            return;
        }

        // play-dl.stream을 사용하여 AudioResource를 생성합니다. (스트림 오류 최종 방지 옵션 추가)
        const stream = await play.stream(currentSong.url, {
            // [중요] YouTube의 암호화된 스트리밍 정보 해독을 돕기 위해 호환성 옵션을 명시적으로 활성화
            discordPlayerCompatibility: true,
        });

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });

        queue.player.play(resource);

        queue.textChannel.send(`🎶 **${currentSong.title}** 재생 시작!`);

    } catch (error) {
        console.error(`[ERROR] 노래 재생 중 오류 발생 (${currentSong.title}):`, error.message);

        // 오류 발생 시 현재 곡 건너뛰고 다음 곡으로 이동
        queue.songs.shift();

        // 오류 메시지를 사용자에게 보냅니다.
        if (queue.textChannel) {
            queue.textChannel.send(`🚨 **${currentSong.title}** 재생 중 오류가 발생했습니다. 다음 곡으로 넘어갑니다. (스트림 오류)`);
        }

        // 대기열에 곡이 남아있다면 다음 곡 재생을 시도
        playNext(guild, queue.songs[0]);
    }
}


// ------------------------------------
// 1. 슬래시 명령어 정의 및 등록 로직
// ------------------------------------
const commands = [
    // ... (슬래시 명령어 정의 코드는 그대로 유지)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 봇 로그인 전에 명령어 등록 시도
// ... (명령어 등록 로직은 그대로 유지)

// ------------------------------------
// 2. 봇 이벤트 핸들러
// ------------------------------------

// 봇 온라인 이벤트
client.once('clientReady', () => {
    console.log(`✅ ${client.user.tag} 봇이 온라인입니다!`);
});

// 메시지 기반 명령어 처리 (접두사: !)
// ... (messageCreate 로직은 그대로 유지)

// 슬래시 명령어 처리 (/)
// ... (interactionCreate 로직은 그대로 유지)

// ------------------------------------
// 3. 봇 로그인
// ------------------------------------
client.login(TOKEN);