import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'zh' | 'en';

const translations: Record<Language, Record<string, string>> = {
  zh: {
    // Nav
    'nav.songs': 'Songs 曲库',
    'nav.learn': 'Learn 课程',
    'nav.tune': 'Tune 调音',
    'nav.tools': 'Tools 工具',
    'nav.profile': 'Profile 我的',

    // Headers
    'title.songs': '吉他伴奏音乐库',
    'title.learn': 'Guitar courses',
    'title.tune': '吉他高精度调音器',
    'title.tools': 'Chord library 和弦库',
    'title.profile': '学员中心',

    // Desktop Simulator
    'sim.title': '微信小程序模拟器 (Taro/React)',
    'sim.docBtn': '构思与架构设计说明',
    'sim.fullscreen': '全屏',
    'sim.mobileFrame': '真机外壳',
    'sim.theme': '主题',
    'sim.lang': '语言',

    // Learn Tab
    'learn.coursesTitle': 'Guitar courses',
    'learn.coursesSubtitle': '系统阶梯式吉他实战训练营',
    'learn.chordTest': '和弦自测',
    'learn.stepCountLabel': '节实战课程（视频 + 麦克风听音）',
    'learn.enterStudy': '进入学习',
    'learn.courseCatalog': '课程目录',
    'learn.freePractice': '自由练习',
    'learn.courseProgress': '课程进度',
    'learn.continueCourse': '继续学习',
    'learn.chapter': '第',
    'learn.chapterSuffix': '章',
    'learn.practiceSong': '实战练习曲目',
    'learn.target': '目标和弦',
    'learn.next': '下一个和弦',
    'learn.micListening': '麦克风实时侦听中',
    'learn.micOff': '麦克风已关闭',
    'learn.waitingPluck': '等待拨弦...',
    'learn.openMic': '开启麦克风听音',
    'learn.closeMic': '关闭麦克风',
    'learn.simulatePluck': '模拟弹奏',
    'learn.switchTrainerChords': '自由切换训练和弦',
    'learn.clickToSwitch': '点击和弦即刻切换',
    'learn.videoTutorial': '视频精讲',
    'learn.keyPoints': '核心要点',
    'learn.finishVideo': '完成视频学习',
    'learn.backToCourses': '返回吉他课程',
    'learn.backToCatalog': '返回课程目录',
    'learn.levelAll': '适合全阶段学员',
    'learn.interactiveMode': '交互式教学',

    // Songs Tab
    'songs.searchPlaceholder': '搜索吉他曲目、歌手、调性...',
    'songs.filterAll': '全部',
    'songs.filterFolk': '民谣',
    'songs.filterRock': '摇滚',
    'songs.filterPop': '流行',
    'songs.filterSolo': '指弹',
    'songs.favorites': '我的收藏',
    'songs.recent': '最近播放',
    'songs.capo': '变调夹',
    'songs.bpm': 'BPM 速度',
    'songs.play': '播放',
    'songs.pause': '暂停',
    'songs.practice': '进阶练琴',
    'songs.tabStaff': '六线谱',
    'songs.clickToJump': '点击从本行歌词开始播放',
    'songs.activeProgress': '播放推进中',
    'songs.soloSegment': '独奏 SOLO 段落',

    // Tune Tab
    'tune.title': '吉他高精度调音器',
    'tune.standard': '标准调音 E A D G B E',
    'tune.pluckPrompt': '请拨响任意吉他琴弦...',
    'tune.inTune': '音准准确',
    'tune.tooLow': '偏低，拧紧弦扭',
    'tune.tooHigh': '偏高，松开弦扭',
    'tune.startMic': '开启调音器',
    'tune.stopMic': '关闭调音器',
    'tune.cents': '音分差',
    'tune.frequency': '当前频率',

    // Tools / Chord Library
    'tools.title': '吉他 Chord 和弦字典',
    'tools.subtitle': '交互式指法位置与多品位检索',
    'tools.root': '选择根音',
    'tools.type': '和弦类型',
    'tools.fingering': '指法图解',
    'tools.playChord': '试听和弦声',
    'tools.difficulty': '难度等级',

    // Profile Tab
    'profile.title': '学员中心',
    'profile.streak': '连续打卡天',
    'profile.practiceMins': '练习分钟',
    'profile.masteredChords': '掌握和弦',
    'profile.completedSongs': '通关曲目',
    'profile.validUntil': '有效期至',
    'profile.currentCourse': '在学课程进度',
    'profile.resumeCourse': '继续学习',
    'profile.orders': '交易与订单记录',
    'profile.viewDetails': '查看明细',
    'profile.settings': '偏好与外观设置',
    'profile.themeSetting': '界面主题风格',
    'profile.dark': '黑夜模式 (Dark)',
    'profile.light': '白天模式 (Light)',
    'profile.langSetting': '系统语言 / Language',
    'profile.zh': '简体中文 (Chinese)',
    'profile.en': 'English (英文)',
  },
  en: {
    // Nav
    'nav.songs': 'Songs',
    'nav.learn': 'Learn',
    'nav.tune': 'Tune',
    'nav.tools': 'Tools',
    'nav.profile': 'Profile',

    // Headers
    'title.songs': 'Guitar Backing Track Songs',
    'title.learn': 'Guitar courses',
    'title.tune': 'Precision Guitar Tuner',
    'title.tools': 'Chord Library & Tools',
    'title.profile': 'Student Center',

    // Desktop Simulator
    'sim.title': 'WeChat Mini-Program Simulator (Taro/React)',
    'sim.docBtn': 'Architecture & Design Spec',
    'sim.fullscreen': 'Full Screen',
    'sim.mobileFrame': 'Mobile Frame',
    'sim.theme': 'Theme',
    'sim.lang': 'Language',

    // Learn Tab
    'learn.coursesTitle': 'Guitar courses',
    'learn.coursesSubtitle': 'Systematic progressive guitar bootcamp',
    'learn.chordTest': 'Chord Test',
    'learn.stepCountLabel': 'lessons included (Video + Mic Trainer)',
    'learn.enterStudy': 'Start Learning',
    'learn.courseCatalog': 'Course Catalog',
    'learn.freePractice': 'Free Practice',
    'learn.courseProgress': 'Course Progress',
    'learn.continueCourse': 'Continue course',
    'learn.chapter': 'Chapter',
    'learn.chapterSuffix': '',
    'learn.practiceSong': 'Practice Song Track',
    'learn.target': 'Target Chord',
    'learn.next': 'Next Chord',
    'learn.micListening': 'Mic listening in real-time',
    'learn.micOff': 'Microphone is off',
    'learn.waitingPluck': 'Waiting for strum...',
    'learn.openMic': 'Start Listening',
    'learn.closeMic': 'Stop Listening',
    'learn.simulatePluck': 'Simulate Strum',
    'learn.switchTrainerChords': 'Switch Practice Chords',
    'learn.clickToSwitch': 'Tap chord to switch instantly',
    'learn.videoTutorial': 'Video Tutorial',
    'learn.keyPoints': 'Key Points',
    'learn.finishVideo': 'Complete Video Lesson',
    'learn.backToCourses': 'Back to Guitar courses',
    'learn.backToCatalog': 'Back to Catalog',
    'learn.levelAll': 'All Levels Welcome',
    'learn.interactiveMode': 'Interactive Training',

    // Songs Tab
    'songs.searchPlaceholder': 'Search songs, artists, keys...',
    'songs.filterAll': 'All',
    'songs.filterFolk': 'Folk',
    'songs.filterRock': 'Rock',
    'songs.filterPop': 'Pop',
    'songs.filterSolo': 'Solo',
    'songs.favorites': 'Favorites',
    'songs.recent': 'Recently Played',
    'songs.capo': 'Capo',
    'songs.bpm': 'BPM',
    'songs.play': 'Play',
    'songs.pause': 'Pause',
    'songs.practice': 'Practice Chords',
    'songs.tabStaff': 'Tablature',
    'songs.clickToJump': 'Click to play from this line',
    'songs.activeProgress': 'Playing',
    'songs.soloSegment': 'Lead Guitar Solo',

    // Tune Tab
    'tune.title': 'Precision Guitar Tuner',
    'tune.standard': 'Standard Tuning (E A D G B E)',
    'tune.pluckPrompt': 'Pluck any guitar string...',
    'tune.inTune': 'In Tune',
    'tune.tooLow': 'Too Flat (Tighten peg)',
    'tune.tooHigh': 'Too Sharp (Loosen peg)',
    'tune.startMic': 'Start Tuner',
    'tune.stopMic': 'Stop Tuner',
    'tune.cents': 'Cents Offset',
    'tune.frequency': 'Current Frequency',

    // Tools / Chord Library
    'tools.title': 'Guitar Chord Library',
    'tools.subtitle': 'Interactive fingering chart and chord generator',
    'tools.root': 'Root Note',
    'tools.type': 'Chord Type',
    'tools.fingering': 'Fingering Diagram',
    'tools.playChord': 'Play Chord Audio',
    'tools.difficulty': 'Difficulty Level',

    // Profile Tab
    'profile.title': 'Student Center',
    'profile.streak': 'Day Streak',
    'profile.practiceMins': 'Practice Mins',
    'profile.masteredChords': 'Mastered Chords',
    'profile.completedSongs': 'Songs Cleared',
    'profile.validUntil': 'Valid until',
    'profile.currentCourse': 'Current Course Progress',
    'profile.resumeCourse': 'Continue Learning',
    'profile.orders': 'Order & Payment History',
    'profile.viewDetails': 'View Details',
    'profile.settings': 'Preferences & Appearance',
    'profile.themeSetting': 'Theme Style',
    'profile.dark': 'Dark Mode',
    'profile.light': 'Light Mode',
    'profile.langSetting': 'System Language',
    'profile.zh': '简体中文 (Chinese)',
    'profile.en': 'English',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('guitarmate_lang');
    return saved === 'en' ? 'en' : 'zh';
  });

  useEffect(() => {
    localStorage.setItem('guitarmate_lang', language);
  }, [language]);

  const toggleLanguage = () => {
    setLanguageState((prev) => (prev === 'zh' ? 'en' : 'zh'));
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string, fallback?: string): string => {
    const currentDict = translations[language];
    if (currentDict && currentDict[key]) {
      return currentDict[key];
    }
    const zhDict = translations.zh;
    if (zhDict && zhDict[key]) {
      return zhDict[key];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
