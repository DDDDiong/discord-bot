require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const connectDB = require('./config/database');
const Attendance = require('./models/attendance');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 데이터베이스 연결
connectDB();

// 날짜 포맷 함수
function formatDate(date) {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });
}

// 시간 포맷 함수
function formatTime(date) {
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

// 근무 시간 계산 함수
function calculateWorkHours(startTime, endTime) {
  const hours = (endTime - startTime) / (1000 * 60 * 60);
  const minutes = Math.floor((hours % 1) * 60);
  return {
    hours: Math.floor(hours),
    minutes: minutes
  };
}

// 로또 번호 생성 함수 추가
function generateLottoNumbers() {
  const numbers = new Set();
  while (numbers.size < 6) {
    numbers.add(Math.floor(Math.random() * 45) + 1);
  }
  return Array.from(numbers).sort((a, b) => a - b);
}

// 로또 번호 색상 매핑 함수 추가
function getLottoBallColor(number) {
  if (number <= 10) return '🔴'; // 빨강
  if (number <= 20) return '🟡'; // 노랑
  if (number <= 30) return '🟢'; // 초록
  if (number <= 40) return '🔵'; // 파랑
  return '⚫'; // 검정
}

// 메뉴 데이터 추가
const menuData = {
  한식: [
    '김치찌개', '된장찌개', '비빔밥', '불고기', '삼겹살', 
    '제육볶음', '김밥', '떡볶이', '순대국', '감자탕',
    '칼국수', '냉면', '삼계탕', '국수', '부대찌개'
  ],
  중식: [
    '짜장면', '짬뽕', '탕수육', '마라탕', '양꼬치',
    '마파두부', '깐풍기', '볶음밥', '동파육', '훠궈'
  ],
  일식: [
    '초밥', '라멘', '우동', '돈까스', '덮밥',
    '카레', '오니기리', '규동', '가츠동', '소바'
  ],
  양식: [
    '파스타', '피자', '햄버거', '스테이크', '샐러드',
    '리조또', '오믈렛', '샌드위치', '타코', '브리또'
  ]
};

// 메뉴 추천 함수 추가
function recommendMenu() {
  const categories = Object.keys(menuData);
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const menuList = menuData[randomCategory];
  const randomMenu = menuList[Math.floor(Math.random() * menuList.length)];
  
  return {
    category: randomCategory,
    menu: randomMenu
  };
}

// 카테고리별 이모지 매핑
const categoryEmoji = {
  한식: '🍚',
  중식: '🥢',
  일식: '🍱',
  양식: '🍝'
};

// 슬래시 커맨드 정의
const commands = [
  new SlashCommandBuilder()
    .setName('출근')
    .setDescription('출근을 기록합니다.'),
  new SlashCommandBuilder()
    .setName('퇴근')
    .setDescription('퇴근을 기록합니다.'),
  new SlashCommandBuilder()
    .setName('기록')
    .setDescription('출퇴근 기록을 조회합니다.')
    .addStringOption(option =>
      option.setName('날짜')
        .setDescription('조회할 날짜 (YYYY-MM-DD) 또는 "오늘", "이번주", "이번달"')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('삭제')
    .setDescription('출퇴근 기록을 삭제합니다.')
    .addStringOption(option =>
      option.setName('날짜')
        .setDescription('삭제할 날짜 (YYYY-MM-DD)')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('로또')
    .setDescription('로또 번호를 자동으로 생성합니다.'),
  new SlashCommandBuilder()
    .setName('점심')
    .setDescription('오늘의 점심 메뉴를 추천합니다.')
];

// 슬래시 커맨드 등록
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Successfully registered slash commands');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;
  const now = new Date();
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  try {
    switch (commandName) {
      case '출근': {
        // 이미 출근했는지 확인
        const existingAttendance = await Attendance.findOne({
          userId: interaction.user.id,
          type: '출근',
          timestamp: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        });

        if (existingAttendance) {
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ 출근 실패')
            .setDescription(`이미 오늘 출근했습니다.`)
            .addFields({ name: '출근 시간', value: formatTime(existingAttendance.timestamp) });
          
          await interaction.reply({ embeds: [embed] });
          return;
        }

        // 출근 기록 저장
        const attendance = new Attendance({
          userId: interaction.user.id,
          username: interaction.user.username,
          type: '출근',
          timestamp: now
        });
        await attendance.save();

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ 출근 완료')
          .addFields(
            { name: '날짜', value: formatDate(now) },
            { name: '출근 시간', value: formatTime(now) }
          );

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case '퇴근': {
        // 오늘 출근 기록 확인
        const todayAttendance = await Attendance.findOne({
          userId: interaction.user.id,
          type: '출근',
          timestamp: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        });

        if (!todayAttendance) {
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ 퇴근 실패')
            .setDescription('오늘 출근 기록이 없습니다.');
          
          await interaction.reply({ embeds: [embed] });
          return;
        }

        // 이미 퇴근했는지 확인
        const existingLeave = await Attendance.findOne({
          userId: interaction.user.id,
          type: '퇴근',
          timestamp: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        });

        if (existingLeave) {
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ 퇴근 실패')
            .setDescription(`이미 퇴근했습니다.`)
            .addFields({ name: '퇴근 시간', value: formatTime(existingLeave.timestamp) });
          
          await interaction.reply({ embeds: [embed] });
          return;
        }

        // 퇴근 기록 저장
        const leave = new Attendance({
          userId: interaction.user.id,
          username: interaction.user.username,
          type: '퇴근',
          timestamp: now
        });
        await leave.save();

        const workTime = calculateWorkHours(todayAttendance.timestamp, now);
        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ 퇴근 완료')
          .addFields(
            { name: '날짜', value: formatDate(now) },
            { name: '출근 시간', value: formatTime(todayAttendance.timestamp) },
            { name: '퇴근 시간', value: formatTime(now) },
            { name: '근무 시간', value: `${workTime.hours}시간 ${workTime.minutes}분` }
          );

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case '기록': {
        const dateOption = interaction.options.getString('날짜') || '오늘';
        let startDate, endDate;
        let periodText = '오늘';

        try {
          if (dateOption === '오늘') {
            startDate = startOfDay;
            endDate = endOfDay;
          } else if (dateOption === '이번주') {
            const currentDay = now.getDay();
            startDate = new Date(now);
            startDate.setDate(now.getDate() - currentDay);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            
            periodText = '이번 주';
          } else if (dateOption === '이번달') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            periodText = '이번 달';
          } else {
            // YYYY-MM-DD 형식 날짜 처리
            const date = new Date(dateOption);
            if (isNaN(date.getTime())) {
              const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ 조회 실패')
                .setDescription('올바른 날짜 형식이 아닙니다.\n사용 가능한 형식: YYYY-MM-DD, 오늘, 이번주, 이번달');
              
              await interaction.reply({ embeds: [embed] });
              return;
            }
            startDate = new Date(date.setHours(0, 0, 0, 0));
            endDate = new Date(date.setHours(23, 59, 59, 999));
            periodText = formatDate(date);
          }

          const records = await Attendance.find({
            userId: interaction.user.id,
            timestamp: {
              $gte: startDate,
              $lte: endDate
            }
          }).sort({ timestamp: 1 });

          if (records.length === 0) {
            const embed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('📊 근태 기록')
              .setDescription(`${periodText}의 출퇴근 기록이 없습니다.`);
            
            await interaction.reply({ embeds: [embed] });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📊 근태 기록')
            .setDescription(`${periodText}의 출퇴근 기록`);

          // 날짜별로 그룹화
          const recordsByDate = {};
          records.forEach(record => {
            const date = formatDate(record.timestamp);
            if (!recordsByDate[date]) {
              recordsByDate[date] = { 출근: null, 퇴근: null };
            }
            recordsByDate[date][record.type] = record;
          });

          // 날짜별 기록 출력
          Object.entries(recordsByDate).forEach(([date, dayRecords]) => {
            let recordText = '';
            if (dayRecords.출근) {
              recordText += `출근: ${formatTime(dayRecords.출근.timestamp)}\n`;
            }
            if (dayRecords.퇴근) {
              recordText += `퇴근: ${formatTime(dayRecords.퇴근.timestamp)}\n`;
            }
            if (dayRecords.출근 && dayRecords.퇴근) {
              const workTime = calculateWorkHours(dayRecords.출근.timestamp, dayRecords.퇴근.timestamp);
              recordText += `근무: ${workTime.hours}시간 ${workTime.minutes}분`;
            }
            embed.addFields({ name: date, value: recordText });
          });

          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          console.error('날짜 처리 중 오류:', error);
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ 조회 실패')
            .setDescription('날짜 처리 중 오류가 발생했습니다.')
            .addFields({ name: '오류 내용', value: error.message });
          
          await interaction.reply({ embeds: [embed] });
          return;
        }
        break;
      }

      case '삭제': {
        const dateOption = interaction.options.getString('날짜');
        const date = new Date(dateOption);
        
        if (isNaN(date.getTime())) {
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ 삭제 실패')
            .setDescription('올바른 날짜 형식이 아닙니다. (YYYY-MM-DD)');
          
          await interaction.reply({ embeds: [embed] });
          return;
        }

        const deleteStartDate = new Date(date.setHours(0, 0, 0, 0));
        const deleteEndDate = new Date(date.setHours(23, 59, 59, 999));

        const result = await Attendance.deleteMany({
          userId: interaction.user.id,
          timestamp: {
            $gte: deleteStartDate,
            $lte: deleteEndDate
          }
        });

        if (result.deletedCount === 0) {
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ 삭제 실패')
            .setDescription(`${formatDate(date)}의 기록이 없습니다.`);
          
          await interaction.reply({ embeds: [embed] });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ 삭제 완료')
          .setDescription(`${formatDate(date)}의 출퇴근 기록이 삭제되었습니다.`)
          .addFields({ name: '삭제된 기록 수', value: `${result.deletedCount}개` });

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case '로또': {
        const numbers = generateLottoNumbers();
        const formattedNumbers = numbers.map(num => {
          const color = getLottoBallColor(num);
          return `${color} ${num.toString().padStart(2, '0')}`;
        });
        
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🎰 로또 번호 생성기')
          .setDescription('이번주 행운의 번호입니다!')
          .addFields({ 
            name: '🎱 자동 생성 번호', 
            value: formattedNumbers.join('  ')
          })
          .setFooter({ 
            text: '행운을 빕니다! 당첨되면 나눠주세요 😉' 
          })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case '점심': {
        const recommendation = recommendMenu();
        const emoji = categoryEmoji[recommendation.category];
        
        const embed = new EmbedBuilder()
          .setColor('#FF9900')
          .setTitle('🍽️ 점심 메뉴 추천')
          .setDescription('오늘은 이거 어때요?')
          .addFields(
            { 
              name: '추천 메뉴', 
              value: `${emoji} **${recommendation.menu}** (${recommendation.category})`
            }
          )
          .setFooter({ 
            text: '맛있게 드세요! 😋' 
          })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        break;
      }
    }
  } catch (error) {
    console.error('Error:', error);
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('⚠️ 오류 발생')
      .setDescription('처리 중 오류가 발생했습니다.')
      .addFields({ name: '오류 내용', value: error.message });
    
    await interaction.reply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN); 
