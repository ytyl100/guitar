import React, { useState, useMemo, useEffect } from 'react';
import { 
  BookOpen, 
  Video, 
  Layers, 
  Users, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  Clock, 
  ArrowUp, 
  ArrowDown, 
  History, 
  Archive, 
  Music, 
  Sliders, 
  Shield, 
  Building2, 
  GraduationCap, 
  UserCheck, 
  Lock, 
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  X,
  Upload,
  Link as LinkIcon,
  ExternalLink,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { GuitarMateLogo } from './GuitarMateLogo';
import { UserProfile, UserRole } from '../types/auth';
import { 
  CourseCurriculum, 
  CourseChapter, 
  ChapterContentItem, 
  TeachingVideo, 
  ChordDrillCombination,
  CHORD_ROOT_NOTES,
  CHORD_QUALITIES,
  VideoCuePoint
} from '../types/curriculum';
import { backendService } from '../utils/backendService';
import { guitarAudio } from '../audio/guitarSynth';
import { ScoreData } from '../types/music';
import { getLibraryItems } from '../utils/librarySource';
import { StudentCourseView } from './StudentCourseView';
import { NotificationBell } from './NotificationBell';
import { InteractiveChordDrillModal } from './InteractiveChordDrillModal';
import { resolveScoreForItem, hasBoundScore, CourseReturnContext } from '../utils/scoreResolver';
import { CreditsExceededModal } from './CreditsExceededModal';
import { PricingPlansView } from './PricingPlansView';
import { CreditRecoveryRequest } from '../types/pricing';

interface CurriculumStudioCMSProps {
  currentUser: UserProfile;
  initialTab?: 'curriculum' | 'videos' | 'chords' | 'users';
  onSwitchUserRole: (role: UserRole) => void;
  onGoHome: () => void;
  onOpenLibrary: () => void;
  onSelectSong: (score: ScoreData, courseContext?: CourseReturnContext) => void;
  initialCourseId?: string | null;
  initialChapterId?: string | null;
}

export const CurriculumStudioCMS: React.FC<CurriculumStudioCMSProps> = ({
  currentUser,
  initialTab = 'curriculum',
  onSwitchUserRole,
  onGoHome,
  onOpenLibrary,
  onSelectSong,
  initialCourseId = null,
  initialChapterId = null,
}) => {
  // Navigation tabs in CMS
  const [activeTab, setActiveTab] = useState<'curriculum' | 'videos' | 'chords' | 'users'>(initialTab);

  // Backend state
  const [courses, setCourses] = useState<CourseCurriculum[]>(() => backendService.getCourses());
  const [videos, setVideos] = useState<TeachingVideo[]>(() => backendService.getVideos());
  const [drills, setDrills] = useState<ChordDrillCombination[]>(() => backendService.getDrills());
  const [users, setUsers] = useState<UserProfile[]>(() => backendService.getUsers());
  const [recoveryRequests, setRecoveryRequests] = useState<CreditRecoveryRequest[]>(() => backendService.getCreditRecoveryRequests());

  // User Management tab state (Section 8.3 & 8.4)
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [assignModalUser, setAssignModalUser] = useState<UserProfile | null>(null);
  const [assignRole, setAssignRole] = useState<UserRole>('student');
  const [assignInstName, setAssignInstName] = useState('柏斯音乐国际教育学院');
  const [assignTeacherName, setAssignTeacherName] = useState('李老师 (认证名师)');
  const [assignSuccessToast, setAssignSuccessToast] = useState<string | null>(null);

  // Credits Exceeded & Pricing modals
  const [exceededCreditsModal, setExceededCreditsModal] = useState<{
    isOpen: boolean;
    type: 'curriculum_publish';
    required: number;
  }>({
    isOpen: false,
    type: 'curriculum_publish',
    required: 15,
  });
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Search & Filter state for Curriculum
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('all');
  const [selectedInstitutionFilter, setSelectedInstitutionFilter] = useState<string>('all');

  // Currently inspected/edited course
  const [activeCourseId, setActiveCourseId] = useState<string>(initialCourseId || courses[0]?.id || '');
  const activeCourse = useMemo(() => courses.find((c) => c.id === activeCourseId) || courses[0], [courses, activeCourseId]);

  useEffect(() => {
    if (initialCourseId) {
      setActiveCourseId(initialCourseId);
    }
  }, [initialCourseId]);

  // Permissions helper
  const isSuperAdmin = currentUser.role === 'super_admin';
  const isTeacher = currentUser.role === 'teacher';
  const isInstitution = currentUser.role === 'institution';
  const isStudentOrGuest = currentUser.role === 'student' || currentUser.role === 'trial_guest';
  const canEditCourse = isSuperAdmin || isTeacher || isInstitution;
  const canManageChords = isSuperAdmin || isTeacher || isInstitution;

  // Student view preview toggle for teachers and super admins
  const [previewAsStudent, setPreviewAsStudent] = useState(false);

  // When student or guest, only curriculum tab is permitted (Requirement 1)
  const currentTab = isStudentOrGuest ? 'curriculum' : activeTab;

  // Level 1: Course Editing State & Handlers
  const [isEditingCourseMeta, setIsEditingCourseMeta] = useState(false);
  const [courseFormTitle, setCourseFormTitle] = useState('');
  const [courseFormSubtitle, setCourseFormSubtitle] = useState('');
  const [courseFormDesc, setCourseFormDesc] = useState('');
  const [courseFormLevel, setCourseFormLevel] = useState('零基础 / 初级');
  const [courseFormCategory, setCourseFormCategory] = useState('民谣指弹');
  const [courseFormLessons, setCourseFormLessons] = useState(12);
  const [courseFormHours, setCourseFormHours] = useState('8.0 小时');
  const [courseFormCover, setCourseFormCover] = useState('');

  const handleOpenEditCourse = (course: CourseCurriculum) => {
    setCourseFormTitle(course.title);
    setCourseFormSubtitle(course.subtitle);
    setCourseFormDesc(course.description);
    setCourseFormLevel(course.level);
    setCourseFormCategory(course.category);
    setCourseFormLessons(course.totalLessons);
    setCourseFormHours(course.totalHours);
    setCourseFormCover(course.coverImage);
    setIsEditingCourseMeta(true);
  };

  const handleSaveEditCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourse) return;
    const updated: CourseCurriculum = {
      ...activeCourse,
      title: courseFormTitle.trim() || activeCourse.title,
      subtitle: courseFormSubtitle.trim() || activeCourse.subtitle,
      description: courseFormDesc.trim() || activeCourse.description,
      level: courseFormLevel,
      category: courseFormCategory,
      totalLessons: Number(courseFormLessons) || activeCourse.totalLessons,
      totalHours: courseFormHours.trim() || activeCourse.totalHours,
      coverImage: courseFormCover.trim() || activeCourse.coverImage,
    };
    handleUpdateActiveCourse(updated);
    setIsEditingCourseMeta(false);
  };

  // Level 2: Chapter Editing State & Handlers
  const [editingChapterData, setEditingChapterData] = useState<CourseChapter | null>(null);
  const [chapterEditTitle, setChapterEditTitle] = useState('');
  const [chapterEditCategory, setChapterEditCategory] = useState('');
  const [chapterEditDesc, setChapterEditDesc] = useState('');
  const [chapterEditDuration, setChapterEditDuration] = useState('45 分钟');

  const handleOpenEditChapter = (chapter: CourseChapter) => {
    setEditingChapterData(chapter);
    setChapterEditTitle(chapter.title);
    setChapterEditCategory(chapter.category);
    setChapterEditDesc(chapter.description);
    setChapterEditDuration(chapter.totalDuration);
  };

  const handleSaveEditChapter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourse || !editingChapterData) return;
    const updatedChapters = activeCourse.chapters.map((ch) => {
      if (ch.id === editingChapterData.id) {
        return {
          ...ch,
          title: chapterEditTitle.trim() || ch.title,
          category: chapterEditCategory.trim() || ch.category,
          description: chapterEditDesc.trim() || ch.description,
          totalDuration: chapterEditDuration.trim() || ch.totalDuration,
        };
      }
      return ch;
    });
    handleUpdateActiveCourse({
      ...activeCourse,
      chapters: updatedChapters,
    });
    setEditingChapterData(null);
  };

  // Level 3: Item Editing State & Handlers
  const [editingItemData, setEditingItemData] = useState<{ chapterId: string; item: ChapterContentItem } | null>(null);
  const [itemEditTitle, setItemEditTitle] = useState('');
  const [itemEditDesc, setItemEditDesc] = useState('');
  const [itemEditBpm, setItemEditBpm] = useState(110);
  const [itemEditVideoId, setItemEditVideoId] = useState('');

  const [itemEditDrillId, setItemEditDrillId] = useState('');
  const [itemEditScoreId, setItemEditScoreId] = useState('');

  const handleOpenEditItem = (chapterId: string, item: ChapterContentItem) => {
    setEditingItemData({ chapterId, item });
    setItemEditTitle(item.title);
    setItemEditDesc(item.description);
    setItemEditBpm(item.bpmTarget || 110);
    setItemEditVideoId(item.videoId || (videos.find((v) => v.status === 'published')?.id || ''));
    setItemEditDrillId(item.chordDrillId || (drills.find((d) => d.status === 'published')?.id || ''));
    setItemEditScoreId(item.scoreId || (getLibraryItems()[0]?.id || ''));
  };

  const handleSaveEditItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourse || !editingItemData) return;
    const { chapterId, item } = editingItemData;

    let updatedItem: ChapterContentItem = {
      ...item,
      title: itemEditTitle.trim() || item.title,
      description: itemEditDesc.trim() || item.description,
    };
    if (item.type === 'video' && itemEditVideoId) {
      const v = videos.find((vid) => vid.id === itemEditVideoId);
      if (v) {
        updatedItem = { ...updatedItem, videoId: v.id, videoUrl: v.videoUrl, cuePoints: v.cuePoints };
      }
    } else if (item.type === 'chord_drill' && itemEditDrillId) {
      const d = drills.find((dr) => dr.id === itemEditDrillId);
      if (d) {
        updatedItem = { ...updatedItem, chordDrillId: d.id, chords: d.chords, bpmTarget: itemEditBpm };
      }
    } else if (item.type === 'transcription_score' && itemEditScoreId) {
      const s = getLibraryItems().find((sc) => sc.id === itemEditScoreId);
      if (s) {
        updatedItem = {
          ...updatedItem,
          scoreId: s.id,
          scoreTitle: s.title,
          scoreArtist: s.artist,
          scoreCoverUrl: s.coverUrl,
          scoreTempo: s.tempo,
        };
      }
    }

    const updatedChapters = activeCourse.chapters.map((ch) => {
      if (ch.id === chapterId) {
        return {
          ...ch,
          items: ch.items.map((it) => (it.id === item.id ? updatedItem : it)),
        };
      }
      return ch;
    });

    handleUpdateActiveCourse({
      ...activeCourse,
      chapters: updatedChapters,
    });
    setEditingItemData(null);
  };

  // Item adding inside chapter
  const [targetChapterForNewItem, setTargetChapterForNewItem] = useState<string | null>(null);
  const [newItemType, setNewItemType] = useState<'video' | 'chord_drill' | 'transcription_score'>('video');
  const [selectedVideoIdForNewItem, setSelectedVideoIdForNewItem] = useState<string>('');
  const [selectedDrillIdForNewItem, setSelectedDrillIdForNewItem] = useState<string>('');
  const [selectedScoreIdForNewItem, setSelectedScoreIdForNewItem] = useState<string>(getLibraryItems()[0]?.id || '');
  const [newItemCustomTitle, setNewItemCustomTitle] = useState('');

  // Version History Modal
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [newVersionNote, setNewVersionNote] = useState('');
  const [showPublishModal, setShowPublishModal] = useState(false);

  // In-app Delete Confirmation & Feedback Notification
  const [courseToDelete, setCourseToDelete] = useState<CourseCurriculum | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<TeachingVideo | null>(null);
  const [drillToDelete, setDrillToDelete] = useState<ChordDrillCombination | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [previewingChordDrill, setPreviewingChordDrill] = useState<{ item: ChapterContentItem; drill: ChordDrillCombination | null } | null>(null);

  // Video Management State (Creation)
  const [videoSourceTab, setVideoSourceTab] = useState<'link' | 'upload'>('link');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoCategory, setNewVideoCategory] = useState('指法技巧');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoDesc, setNewVideoDesc] = useState('');
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState('');
  const [videoValidationStatus, setVideoValidationStatus] = useState<{ isValid: boolean | null; message: string }>({ isValid: null, message: '' });

  // Selected video for player & cue points
  const [selectedVideoForCuePoints, setSelectedVideoForCuePoints] = useState<TeachingVideo | null>(videos[0] || null);
  const [newCueTimeSeconds, setNewCueTimeSeconds] = useState(45);
  const [newCueLabel, setNewCueLabel] = useState('');

  // Video Overwrite / Edit Existing Video State
  const [isEditingCurrentVideo, setIsEditingCurrentVideo] = useState(false);
  const [editVideoTitle, setEditVideoTitle] = useState('');
  const [editVideoCategory, setEditVideoCategory] = useState('');
  const [editVideoDesc, setEditVideoDesc] = useState('');
  const [editVideoSourceTab, setEditVideoSourceTab] = useState<'link' | 'upload'>('link');
  const [editVideoUrl, setEditVideoUrl] = useState('');
  const [editUploadedFile, setEditUploadedFile] = useState<File | null>(null);
  const [editUploadedUrl, setEditUploadedUrl] = useState('');
  const [editValidationStatus, setEditValidationStatus] = useState<{ isValid: boolean | null; message: string }>({ isValid: null, message: '' });

  // Chord Generator State (Two-tier matrix & Editor)
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(() => drills[0]?.id || null);
  const [selectedRootNote, setSelectedRootNote] = useState<string>('C');
  const [selectedChordQuality, setSelectedChordQuality] = useState<string>('major');
  const [currentChordSequence, setCurrentChordSequence] = useState<string[]>(() => drills[0]?.chords ? [...drills[0].chords] : ['C', 'Am', 'F', 'G']);
  const [chordDrillTitle, setChordDrillTitle] = useState(() => drills[0]?.title || '流行经典 1645 万能走向');
  const [chordBpmStart, setChordBpmStart] = useState(() => drills[0]?.bpmStart || 60);
  const [chordBpmTarget, setChordBpmTarget] = useState(() => drills[0]?.bpmTarget || 110);
  const [drillSuccessMsg, setDrillSuccessMsg] = useState('');

  // Save changes to course helper
  const handleUpdateActiveCourse = (updatedCourse: CourseCurriculum) => {
    if (!canEditCourse) return;
    const updated = backendService.saveSingleCourse(updatedCourse);
    setCourses(updated);
  };

  // Move Chapter order
  const handleMoveChapter = (chapterId: string, direction: 'up' | 'down') => {
    if (!canEditCourse || !activeCourse) return;
    const idx = activeCourse.chapters.findIndex((c) => c.id === chapterId);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= activeCourse.chapters.length) return;

    const newChapters = [...activeCourse.chapters];
    const temp = newChapters[idx];
    newChapters[idx] = newChapters[targetIdx];
    newChapters[targetIdx] = temp;

    handleUpdateActiveCourse({
      ...activeCourse,
      chapters: newChapters,
    });
  };

  // Add Chapter
  const handleAddChapter = () => {
    if (!canEditCourse || !activeCourse) return;
    const newChapter: CourseChapter = {
      id: `chap_${Date.now()}`,
      title: `第 ${activeCourse.chapters.length + 1} 章 · 新增训练模块`,
      category: '综合演练',
      description: '点击编辑本章节说明与训练目标。',
      totalDuration: '40 分钟',
      orderIndex: activeCourse.chapters.length + 1,
      items: [],
    };
    handleUpdateActiveCourse({
      ...activeCourse,
      chapters: [...activeCourse.chapters, newChapter],
    });
  };

  // Delete Chapter
  const handleDeleteChapter = (chapterId: string) => {
    if (!canEditCourse || !activeCourse) return;
    handleUpdateActiveCourse({
      ...activeCourse,
      chapters: activeCourse.chapters.filter((c) => c.id !== chapterId),
    });
  };

  // Add Item to Chapter
  const handleAddItemToChapter = () => {
    if (!canEditCourse || !activeCourse || !targetChapterForNewItem) return;
    
    let newItem: ChapterContentItem;
    if (newItemType === 'video') {
      const publishedVids = videos.filter((v) => v.status === 'published');
      const v = publishedVids.find((item) => item.id === selectedVideoIdForNewItem) || publishedVids[0];
      if (!v) {
        setFeedbackNotice({
          type: 'warning',
          message: '⚠️ 暂无已发布的教学视频，请先在「教学视频与关键打点」页面发布至少一个视频后再绑定！',
        });
        setTimeout(() => setFeedbackNotice(null), 3500);
        return;
      }
      newItem = {
        id: `item_${Date.now()}`,
        title: newItemCustomTitle.trim() || `精讲视频：${v.title}`,
        type: 'video',
        description: v.description,
        orderIndex: 99,
        videoId: v.id,
        videoUrl: v.videoUrl,
        cuePoints: v.cuePoints,
      };
    } else if (newItemType === 'chord_drill') {
      const publishedDrills = drills.filter((d) => d.status === 'published');
      const d = publishedDrills.find((item) => item.id === selectedDrillIdForNewItem) || publishedDrills[0];
      if (!d) {
        setFeedbackNotice({
          type: 'warning',
          message: '⚠️ 暂无已发布的和弦微测，请先在「和弦微测与BPM阶梯」页面发布至少一个组合后再绑定！',
        });
        setTimeout(() => setFeedbackNotice(null), 3500);
        return;
      }
      newItem = {
        id: `item_${Date.now()}`,
        title: newItemCustomTitle.trim() || `和弦阶梯微测：${d.title}`,
        type: 'chord_drill',
        description: `和弦走向：${d.chords.join(' - ')}，BPM 阶梯目标：${d.bpmTarget}`,
        orderIndex: 99,
        chordDrillId: d.id,
        chords: d.chords,
        bpmTarget: d.bpmTarget,
      };
    } else {
      const selectedScore = getLibraryItems().find((s) => s.id === selectedScoreIdForNewItem) || getLibraryItems()[0];
      newItem = {
        id: `item_${Date.now()}`,
        title: newItemCustomTitle.trim() || `曲谱实战跟练：${selectedScore.title}`,
        type: 'transcription_score',
        description: `来自曲谱库：${selectedScore.artist} · ${selectedScore.tempo} BPM · ${selectedScore.keySignature}`,
        orderIndex: 99,
        scoreId: selectedScore.id,
        scoreTitle: selectedScore.title,
        scoreArtist: selectedScore.artist,
        scoreCoverUrl: selectedScore.coverUrl,
        scoreTempo: selectedScore.tempo,
      };
    }

    const updatedChapters = activeCourse.chapters.map((ch) => {
      if (ch.id === targetChapterForNewItem) {
        return {
          ...ch,
          items: [...ch.items, newItem],
        };
      }
      return ch;
    });

    handleUpdateActiveCourse({
      ...activeCourse,
      chapters: updatedChapters,
    });

    setTargetChapterForNewItem(null);
    setNewItemCustomTitle('');
  };

  // Delete Item from Chapter
  const handleDeleteItem = (chapterId: string, itemId: string) => {
    if (!canEditCourse || !activeCourse) return;
    const updatedChapters = activeCourse.chapters.map((ch) => {
      if (ch.id === chapterId) {
        return {
          ...ch,
          items: ch.items.filter((it) => it.id !== itemId),
        };
      }
      return ch;
    });
    handleUpdateActiveCourse({
      ...activeCourse,
      chapters: updatedChapters,
    });
  };

  // Move Item order inside Chapter
  const handleMoveItem = (chapterId: string, itemId: string, direction: 'up' | 'down') => {
    if (!canEditCourse || !activeCourse) return;
    const ch = activeCourse.chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    const idx = ch.items.findIndex((it) => it.id === itemId);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= ch.items.length) return;

    const newItems = [...ch.items];
    const temp = newItems[idx];
    newItems[idx] = newItems[targetIdx];
    newItems[targetIdx] = temp;

    const updatedChapters = activeCourse.chapters.map((c) => (c.id === chapterId ? { ...c, items: newItems } : c));
    handleUpdateActiveCourse({
      ...activeCourse,
      chapters: updatedChapters,
    });
  };

  // Publish / Archive / Rollback / Delete Course
  const handlePublishCourse = () => {
    if (!canEditCourse || !activeCourse) return;

    // Credits check (15 credits per version publish, super_admin exempt)
    if (currentUser.role !== 'super_admin' && !currentUser.isUnlimitedCredits) {
      const balanceCheck = backendService.checkCredits(currentUser.id, 15);
      if (!balanceCheck.hasEnough) {
        setShowPublishModal(false);
        setExceededCreditsModal({
          isOpen: true,
          type: 'curriculum_publish',
          required: 15,
        });
        return;
      }
      backendService.deductCredits(
        currentUser.id,
        15,
        `发布课程大纲版本: 《${activeCourse.title}》 (${activeCourse.version || 'v1.0'})`,
        'curriculum_publish'
      );
    }

    const updated = backendService.publishCourse(activeCourse.id, newVersionNote, currentUser.name);
    setCourses(updated);
    setShowPublishModal(false);
    setNewVersionNote('');
  };

  const handleArchiveCourse = () => {
    if (!canEditCourse || !activeCourse) return;
    const updated = backendService.archiveCourse(activeCourse.id);
    setCourses(updated);
  };

  const handleConfirmDeleteCourse = () => {
    if (!courseToDelete) return;
    const deletedTitle = courseToDelete.title;
    const deletedId = courseToDelete.id;
    const updated = backendService.deleteCourse(deletedId);
    setCourses(updated);
    if (activeCourseId === deletedId) {
      setActiveCourseId(updated[0]?.id || '');
    }
    setCourseToDelete(null);
    setFeedbackNotice({
      message: `已彻底删除课程：《${deletedTitle}》`,
      type: 'success',
    });
    setTimeout(() => {
      setFeedbackNotice(null);
    }, 3500);
  };

  const handleRollbackVersion = (versionStr: string) => {
    if (!canEditCourse || !activeCourse) return;
    const updated = backendService.rollbackVersion(activeCourse.id, versionStr);
    setCourses(updated);
    setShowVersionHistoryModal(false);
  };

  // URL / Format Validator Helper
  const validateVideoUrlString = (url: string): { isValid: boolean; message: string } => {
    if (!url || !url.trim()) {
      return { isValid: false, message: '视频链接地址不能为空' };
    }
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return { isValid: false, message: '视频链接必须以 http:// 或 https:// 开头' };
    }
    if (/(douyin|tiktok|weixin|wechat|xiaohongshu|bilibili|youtube|youku|b23\.tv)/i.test(trimmed)) {
      return { isValid: true, message: '✓ 媒体平台链接解析有效（支持微信视频/抖音/小红书/B站/YouTube）' };
    }
    if (/\.(mp4|webm|mov|ogg|m4v)($|\?)/i.test(trimmed)) {
      return { isValid: true, message: '✓ 直接视频流格式解析有效 (MP4/WebM/MOV)' };
    }
    return { isValid: true, message: '✓ 视频网络地址格式合规' };
  };

  // Add / Create Video
  const handleAddVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoTitle.trim()) return;

    let finalVideoUrl = '';
    if (videoSourceTab === 'upload') {
      if (!uploadedVideoUrl) {
        setVideoValidationStatus({ isValid: false, message: '请先选择需要上传的本地视频文件 (.mp4, .webm, .mov)' });
        return;
      }
      finalVideoUrl = uploadedVideoUrl;
    } else {
      const check = validateVideoUrlString(newVideoUrl);
      setVideoValidationStatus(check);
      if (!check.isValid) return;
      finalVideoUrl = newVideoUrl.trim();
    }

    const newVid: TeachingVideo = {
      id: `vid_${Date.now()}`,
      title: newVideoTitle.trim(),
      description: newVideoDesc.trim() || '教师上传教学录像',
      category: newVideoCategory.trim() || '通用指法',
      videoUrl: finalVideoUrl,
      videoSourceType: videoSourceTab,
      status: 'published', // Published by default so it's ready for curriculum binding
      durationFormatted: '10:00',
      associatedCourseId: activeCourse?.id,
      associatedCourseTitle: activeCourse?.title,
      cuePoints: [
        { id: `cue_${Date.now()}`, timeSeconds: 15, timeFormatted: '00:15', label: '开篇技巧要领' },
      ],
    };

    const updated = backendService.saveSingleVideo(newVid);
    setVideos(updated);
    setSelectedVideoForCuePoints(newVid);
    setNewVideoTitle('');
    setNewVideoDesc('');
    setNewVideoUrl('');
    setUploadedVideoFile(null);
    setUploadedVideoUrl('');
    setVideoValidationStatus({ isValid: true, message: '✓ 视频已成功创建并在预览区加载！可在课程大纲中绑定。' });
    setTimeout(() => setVideoValidationStatus({ isValid: null, message: '' }), 4000);
  };

  // Edit / Overwrite Current Video Handlers
  const handleStartEditCurrentVideo = (vid: TeachingVideo) => {
    setIsEditingCurrentVideo(true);
    setEditVideoTitle(vid.title);
    setEditVideoCategory(vid.category);
    setEditVideoDesc(vid.description);
    setEditVideoSourceTab(vid.videoSourceType || 'link');
    setEditVideoUrl(vid.videoUrl.startsWith('blob:') ? '' : vid.videoUrl);
    setEditUploadedFile(null);
    setEditUploadedUrl('');
    setEditValidationStatus({ isValid: null, message: '' });
  };

  const handleSaveEditCurrentVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVideoForCuePoints) return;

    let finalUrl = selectedVideoForCuePoints.videoUrl;
    if (editVideoSourceTab === 'upload') {
      if (editUploadedUrl) {
        finalUrl = editUploadedUrl;
      }
    } else {
      if (editVideoUrl.trim()) {
        const check = validateVideoUrlString(editVideoUrl);
        setEditValidationStatus(check);
        if (!check.isValid) return;
        finalUrl = editVideoUrl.trim();
      }
    }

    const updated: TeachingVideo = {
      ...selectedVideoForCuePoints,
      title: editVideoTitle.trim() || selectedVideoForCuePoints.title,
      category: editVideoCategory.trim() || selectedVideoForCuePoints.category,
      description: editVideoDesc.trim() || selectedVideoForCuePoints.description,
      videoUrl: finalUrl,
      videoSourceType: editVideoSourceTab,
    };

    const updatedList = backendService.saveSingleVideo(updated);
    setVideos(updatedList);
    setSelectedVideoForCuePoints(updated);
    setIsEditingCurrentVideo(false);
    setFeedbackNotice({
      type: 'success',
      message: `已更新视频《${updated.title}》信息与源链接`,
    });
    setTimeout(() => setFeedbackNotice(null), 3000);
  };

  // Toggle Video Published / Draft status
  const handleToggleVideoPublish = (vid: TeachingVideo) => {
    const nextStatus = vid.status === 'published' ? 'draft' : 'published';
    const updated: TeachingVideo = {
      ...vid,
      status: nextStatus,
    };
    const updatedList = backendService.saveSingleVideo(updated);
    setVideos(updatedList);
    setSelectedVideoForCuePoints(updated);
    setFeedbackNotice({
      type: 'success',
      message: nextStatus === 'published'
        ? `视频《${vid.title}》已发布上线，现可在课程大纲中进行绑定！`
        : `视频《${vid.title}》已转为草稿（已取消发布）`,
    });
    setTimeout(() => setFeedbackNotice(null), 3500);
  };

  // Delete Video (Rule: Must unpublish first before deleting)
  const handleDeleteVideoClick = (vid: TeachingVideo) => {
    if (vid.status === 'published') {
      setFeedbackNotice({
        type: 'warning',
        message: '⚠️ 该视频处于「已发布」状态。请先点击「取消发布」转为草稿后再进行删除！',
      });
      setTimeout(() => setFeedbackNotice(null), 4000);
      return;
    }
    setVideoToDelete(vid);
  };

  const handleConfirmDeleteVideo = () => {
    if (!videoToDelete) return;
    const deletedTitle = videoToDelete.title;
    const updatedVideos = backendService.deleteVideo(videoToDelete.id);
    setVideos(updatedVideos);
    if (selectedVideoForCuePoints?.id === videoToDelete.id) {
      setSelectedVideoForCuePoints(updatedVideos[0] || null);
    }
    // Update courses since backendService.deleteVideo cleans up all chapter items
    setCourses(backendService.getCourses());
    setVideoToDelete(null);
    setFeedbackNotice({
      type: 'success',
      message: `已彻底删除视频《${deletedTitle}》及其全部打点节点，已清理课程大纲中所有关联绑定！`,
    });
    setTimeout(() => setFeedbackNotice(null), 4000);
  };

  // Add Cue Point to Selected Video
  const handleAddCuePoint = () => {
    if (!selectedVideoForCuePoints || !newCueLabel.trim()) return;
    const mins = Math.floor(newCueTimeSeconds / 60);
    const secs = newCueTimeSeconds % 60;
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const newCue: VideoCuePoint = {
      id: `cue_${Date.now()}`,
      timeSeconds: newCueTimeSeconds,
      timeFormatted,
      label: newCueLabel.trim(),
    };
    const updatedVideo: TeachingVideo = {
      ...selectedVideoForCuePoints,
      cuePoints: [...selectedVideoForCuePoints.cuePoints, newCue].sort((a, b) => a.timeSeconds - b.timeSeconds),
    };
    const updatedList = backendService.saveSingleVideo(updatedVideo);
    setVideos(updatedList);
    setSelectedVideoForCuePoints(updatedVideo);
    setNewCueLabel('');
  };

  // Delete Cue Point
  const handleDeleteCuePoint = (cueId: string) => {
    if (!selectedVideoForCuePoints) return;
    const updatedVideo: TeachingVideo = {
      ...selectedVideoForCuePoints,
      cuePoints: selectedVideoForCuePoints.cuePoints.filter((c) => c.id !== cueId),
    };
    const updatedList = backendService.saveSingleVideo(updatedVideo);
    setVideos(updatedList);
    setSelectedVideoForCuePoints(updatedVideo);
  };

  // Chord Generator Preview Note
  const handlePlayChordRoot = (root: string) => {
    const noteMap: Record<string, number> = {
      'C': 48, 'C#': 49, 'D': 50, 'D#': 51, 'E': 52, 'F': 53,
      'F#': 54, 'G': 55, 'G#': 56, 'A': 57, 'A#': 58, 'B': 59
    };
    const midi = noteMap[root] || 48;
    guitarAudio.playNote(midi, 1.0, 0.9, 'acoustic');
  };

  // Add Chord to current sequence
  const handleAddChordToSequence = () => {
    const fullChord = selectedChordQuality === 'major' 
      ? selectedRootNote 
      : selectedChordQuality === 'minor' 
        ? `${selectedRootNote}m` 
        : `${selectedRootNote}${selectedChordQuality}`;
    setCurrentChordSequence([...currentChordSequence, fullChord]);
    handlePlayChordRoot(selectedRootNote);
  };

  // Chord Drill Selection on the Right Column (selects & loads into the left editor)
  const handleSelectDrill = (drill: ChordDrillCombination) => {
    setSelectedDrillId(drill.id);
    setChordDrillTitle(drill.title);
    setCurrentChordSequence([...drill.chords]);
    setChordBpmStart(drill.bpmStart);
    setChordBpmTarget(drill.bpmTarget);
    setDrillSuccessMsg(`已载入走向：《${drill.title}》，可在左侧直接修改或更新保存`);
    setFeedbackNotice({
      type: 'info',
      message: `已选中和弦走向：《${drill.title}》，可在左侧直接修改或编排更新！`,
    });
    setTimeout(() => setFeedbackNotice(null), 2500);
  };

  // Revert edits on current selected drill, or clear if in new mode
  const handleCancelEditDrill = () => {
    const current = drills.find((d) => d.id === selectedDrillId);
    if (current) {
      setChordDrillTitle(current.title);
      setCurrentChordSequence([...current.chords]);
      setChordBpmStart(current.bpmStart);
      setChordBpmTarget(current.bpmTarget);
      setDrillSuccessMsg(`已还原和弦走向《${current.title}》为保存状态`);
      setFeedbackNotice({
        type: 'info',
        message: `已还原走向《${current.title}》为保存状态`,
      });
    } else {
      setSelectedDrillId(null);
      setChordDrillTitle('自定义和弦阶梯挑战');
      setCurrentChordSequence(['C', 'G', 'Am', 'F']);
      setChordBpmStart(60);
      setChordBpmTarget(110);
      setDrillSuccessMsg('');
      setFeedbackNotice({
        type: 'info',
        message: '已清空走向编排，当前为新建模式。可点击右侧任意走向卡片重新载入',
      });
    }
    setTimeout(() => setFeedbackNotice(null), 2500);
  };

  // Start fresh new drill
  const handleStartCreateNewDrill = () => {
    setSelectedDrillId(null);
    setChordDrillTitle('自定义和弦阶梯挑战');
    setCurrentChordSequence(['C', 'G', 'Am', 'F']);
    setChordBpmStart(60);
    setChordBpmTarget(110);
    setDrillSuccessMsg('');
    setFeedbackNotice({
      type: 'info',
      message: '已切换为新建模式，可在左侧矩阵添加和弦后保存为新走向',
    });
    setTimeout(() => setFeedbackNotice(null), 2500);
  };

  // Save New Chord Combination
  const handleSaveChordCombination = () => {
    if (currentChordSequence.length === 0) return;
    const newDrill: ChordDrillCombination = {
      id: `drill_${Date.now()}`,
      title: chordDrillTitle.trim() || `走向：${currentChordSequence.join(' - ')}`,
      chords: currentChordSequence,
      bpmStart: chordBpmStart,
      bpmTarget: chordBpmTarget,
      steps: [chordBpmStart, Math.round((chordBpmStart + chordBpmTarget) / 2), chordBpmTarget],
      description: `双层和弦微测生成组合，起始 ${chordBpmStart} BPM，达标 ${chordBpmTarget} BPM`,
      createdAt: new Date().toISOString().split('T')[0],
      status: 'published',
    };
    const updated = backendService.saveSingleDrill(newDrill);
    setDrills(updated);
    setSelectedDrillId(newDrill.id);
    setDrillSuccessMsg(`已成功保存和弦组合：${newDrill.title}（已发布，可在课程大纲中绑定）`);
    setFeedbackNotice({
      type: 'success',
      message: `已成功保存和弦组合：《${newDrill.title}》！`,
    });
    setTimeout(() => {
      setFeedbackNotice(null);
    }, 3000);
  };

  // Update Existing Chord Combination
  const handleUpdateExistingDrill = () => {
    if (!selectedDrillId || currentChordSequence.length === 0) return;
    const existing = drills.find((d) => d.id === selectedDrillId);
    if (!existing) return;
    const updatedDrill: ChordDrillCombination = {
      ...existing,
      title: chordDrillTitle.trim() || existing.title,
      chords: currentChordSequence,
      bpmStart: chordBpmStart,
      bpmTarget: chordBpmTarget,
      steps: [chordBpmStart, Math.round((chordBpmStart + chordBpmTarget) / 2), chordBpmTarget],
      description: `更新后的双层和弦微测，起始 ${chordBpmStart} BPM，达标 ${chordBpmTarget} BPM`,
    };
    const updated = backendService.saveSingleDrill(updatedDrill);
    setDrills(updated);
    setSelectedDrillId(updatedDrill.id);
    setDrillSuccessMsg(`已成功更新和弦微测走向：${updatedDrill.title}`);
    setFeedbackNotice({
      type: 'success',
      message: `✓ 已成功更新和弦走向：《${updatedDrill.title}》！右侧列表已同步刷新`,
    });
    setTimeout(() => {
      setFeedbackNotice(null);
    }, 3000);
  };

  // Toggle Drill Publish / Draft Status
  const handleToggleDrillStatus = (drillId: string) => {
    const target = drills.find((d) => d.id === drillId);
    if (!target) return;
    const nextStatus = target.status === 'published' ? 'draft' : 'published';
    const updated = backendService.saveSingleDrill({ ...target, status: nextStatus });
    setDrills(updated);
    setFeedbackNotice({
      type: 'success',
      message: nextStatus === 'published'
        ? `和弦走向《${target.title}》已发布上线，现可在课程大纲中绑定！`
        : `和弦走向《${target.title}》已设为草稿（已取消发布）`,
    });
    setTimeout(() => setFeedbackNotice(null), 3000);
  };

  // Publish All Drills
  const handlePublishAllDrills = () => {
    const updated = backendService.publishAllDrills();
    setDrills(updated);
    setFeedbackNotice({
      type: 'success',
      message: `🎉 已统一发布全部 ${updated.length} 个和弦微测组合，均可在课程大纲中直接选用！`,
    });
    setTimeout(() => setFeedbackNotice(null), 3500);
  };

  // Delete Drill (with confirmation and cascade cleanup)
  const handleDeleteDrillClick = (drill: ChordDrillCombination) => {
    setDrillToDelete(drill);
  };

  const handleConfirmDeleteDrill = () => {
    if (!drillToDelete) return;
    const title = drillToDelete.title;
    const updated = backendService.deleteDrill(drillToDelete.id);
    setDrills(updated);
    if (selectedDrillId === drillToDelete.id) {
      const nextSelected = updated[0]?.id || null;
      setSelectedDrillId(nextSelected);
      if (nextSelected && updated[0]) {
        setChordDrillTitle(updated[0].title);
        setCurrentChordSequence([...updated[0].chords]);
        setChordBpmStart(updated[0].bpmStart);
        setChordBpmTarget(updated[0].bpmTarget);
      } else {
        handleStartCreateNewDrill();
      }
    }
    // Update courses since backendService.deleteDrill cleans up all chapter items
    setCourses(backendService.getCourses());
    setDrillToDelete(null);
    setFeedbackNotice({
      type: 'success',
      message: `已删除和弦走向《${title}》，并自动清理了所有课程大纲中对应的绑定链接！`,
    });
    setTimeout(() => setFeedbackNotice(null), 3500);
  };

  // Filtered courses
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchSub = c.subtitle.toLowerCase().includes(q);
        const matchTeacher = c.teacherName.toLowerCase().includes(q);
        const matchInst = c.institutionName.toLowerCase().includes(q);
        if (!matchTitle && !matchSub && !matchTeacher && !matchInst) return false;
      }
      if (selectedTeacherFilter !== 'all' && c.teacherId !== selectedTeacherFilter) {
        return false;
      }
      if (selectedInstitutionFilter !== 'all' && c.institutionId !== selectedInstitutionFilter) {
        return false;
      }
      return true;
    });
  }, [courses, searchQuery, selectedTeacherFilter, selectedInstitutionFilter]);

  // Unique teachers & institutions for filter
  const uniqueTeachers = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => map.set(c.teacherId, c.teacherName));
    return Array.from(map.entries());
  }, [courses]);

  const uniqueInstitutions = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => map.set(c.institutionId, c.institutionName));
    return Array.from(map.entries());
  }, [courses]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 flex flex-col font-sans select-none antialiased">
      
      {/* 1. TOP HEADER & ROLE SWITCHER */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-gray-200/90 px-4 sm:px-8 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-3 sm:space-x-5">
          <GuitarMateLogo size="md" variant="light" />

          <div className="h-5 w-px bg-gray-200 hidden sm:block" />

          <button
            onClick={onGoHome}
            className="flex items-center space-x-1.5 text-xs font-semibold text-gray-600 hover:text-emerald-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">返回首页</span>
          </button>

          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md hidden md:inline-flex items-center space-x-1">
            <Sparkles className="w-3 h-3 text-emerald-600" />
            <span>GuitarMate Studio CMS 课程教务中心</span>
          </span>
        </div>

        {/* Current Role Indicator & Instant Role Switcher for Tester */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5 bg-gray-100 p-1 rounded-lg border border-gray-200 text-[11px] font-semibold">
            <span className="text-gray-500 pl-1.5 hidden lg:inline">当前身份:</span>
            
            <button
              onClick={() => onSwitchUserRole('super_admin')}
              className={`px-2 py-1 rounded transition-all cursor-pointer ${
                currentUser.role === 'super_admin' ? 'bg-[#188065] text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
              title="切换为超级管理员"
            >
              👑 超管
            </button>
            <button
              onClick={() => onSwitchUserRole('institution')}
              className={`px-2 py-1 rounded transition-all cursor-pointer ${
                currentUser.role === 'institution' ? 'bg-[#188065] text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
              title="切换为教学机构"
            >
              🏛️ 机构
            </button>
            <button
              onClick={() => onSwitchUserRole('teacher')}
              className={`px-2 py-1 rounded transition-all cursor-pointer ${
                currentUser.role === 'teacher' ? 'bg-[#188065] text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
              title="切换为教师"
            >
              🎸 教师
            </button>
            <button
              onClick={() => onSwitchUserRole('student')}
              className={`px-2 py-1 rounded transition-all cursor-pointer ${
                currentUser.role === 'student' ? 'bg-[#188065] text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
              title="切换为学员"
            >
              🎓 学员
            </button>
            <button
              onClick={() => onSwitchUserRole('trial_guest')}
              className={`px-2 py-1 rounded transition-all cursor-pointer ${
                currentUser.role === 'trial_guest' ? 'bg-[#188065] text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
              title="切换为普通用户"
            >
              👤 游客
            </button>
          </div>

          <button
            onClick={onOpenLibrary}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 shadow-2xs cursor-pointer"
          >
            <span>曲谱库</span>
          </button>

          {/* Bell Notification in CMS top right menu */}
          <NotificationBell
            onOpenCourse={(cid) => {
              if (cid) setActiveCourseId(cid);
              setActiveTab('curriculum');
            }}
            onOpenScore={(sid) => {
              const found = getLibraryItems().find((s) => s.id === sid);
              if (found) {
                onSelectSong(found.score);
              }
            }}
          />
        </div>
      </header>

      {/* 2. CMS NAVIGATION TABS & ROLE NOTIFICATION */}
      <div className="w-full bg-white border-b border-gray-200 px-4 sm:px-8 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('curriculum')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
              currentTab === 'curriculum'
                ? 'bg-[#188065] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>课程大纲与 20m 切片编排</span>
          </button>

          {/* Videos & Chords tabs: Only visible to teachers / institutions / super admins (Requirement 1) */}
          {!isStudentOrGuest && (
            <>
              <button
                onClick={() => setActiveTab('videos')}
                className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                  currentTab === 'videos'
                    ? 'bg-[#188065] text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>教学视频与关键打点 ({videos.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('chords')}
                className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                  currentTab === 'chords'
                    ? 'bg-[#188065] text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>和弦微测与 BPM 阶梯 ({drills.length})</span>
              </button>
            </>
          )}

          {/* Users Tab: Super Admin & Institution only */}
          {!isStudentOrGuest && (isSuperAdmin || isInstitution || isTeacher) && (
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                currentTab === 'users'
                  ? 'bg-[#188065] text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>用户组权限与学分管理 ({users.length})</span>
            </button>
          )}
        </div>

        {/* Right Action: Preview student view toggle & Permission status alert badge */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {canEditCourse && (
            <button
              type="button"
              onClick={() => setPreviewAsStudent(!previewAsStudent)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                previewAsStudent
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}
              title="切换以学员身份体验 13 章节课纲、打点视频、实战乐谱与和弦微测流程"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{previewAsStudent ? '退出学员端预览' : '👀 预览学员端课程与进度'}</span>
            </button>
          )}

          {isSuperAdmin && (
            <span className="flex items-center space-x-1 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>超级管理员特权：全站用户与大纲完全控制</span>
            </span>
          )}
          {isInstitution && (
            <span className="flex items-center space-x-1 text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
              <Building2 className="w-3.5 h-3.5 text-amber-600" />
              <span>教学机构视角：可查阅大纲与学分，无法修改课程大纲</span>
            </span>
          )}
          {isTeacher && (
            <span className="flex items-center space-x-1 text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-md">
              <GraduationCap className="w-3.5 h-3.5 text-teal-600" />
              <span>认证教师：拥有自身课程大纲发布、归档、版本与删除权</span>
            </span>
          )}
          {currentUser.role === 'student' && (
            <span className="flex items-center space-x-1 text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">
              <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>学员：挂靠李老师（累积学分：{currentUser.credits} 点，只读课纲与打卡练习）</span>
            </span>
          )}
          {currentUser.role === 'trial_guest' && (
            <span className="flex items-center space-x-1 text-gray-600 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-gray-500" />
              <span>试用注册用户：只读基础课程大纲与跟练打卡</span>
            </span>
          )}
        </div>
      </div>

      {/* 3. MAIN CONTENT PANELS */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {/* ========================================================================= */}
        {/* TAB 1: 课程大纲与 20m 切片编排 (3-TIER CURRICULUM AUTHORING / STUDENT COURSE VIEW) */}
        {/* ========================================================================= */}
        {currentTab === 'curriculum' && (
          (isStudentOrGuest || previewAsStudent) ? (
            /* 学员与注册用户课程端 / 教师学员端预览 (Requirements 1-7) */
            <StudentCourseView
              currentUser={currentUser}
              courses={courses}
              videos={videos}
              drills={drills}
              onSelectSong={onSelectSong}
              onGoHome={onGoHome}
              onOpenLibrary={onOpenLibrary}
              initialCourseId={initialCourseId}
              initialChapterId={initialChapterId}
            />
          ) : (
            <div className="space-y-6">
            
            {/* Search & Filter bar for curriculum querying */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-1 items-center space-x-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索课程标题、章节、教师或机构名称..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                  />
                </div>

                {/* Filter by Teacher */}
                <select
                  value={selectedTeacherFilter}
                  onChange={(e) => setSelectedTeacherFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 cursor-pointer"
                >
                  <option value="all">全部教师</option>
                  {uniqueTeachers.map(([tid, tname]) => (
                    <option key={tid} value={tid}>{tname}</option>
                  ))}
                </select>

                {/* Filter by Institution */}
                <select
                  value={selectedInstitutionFilter}
                  onChange={(e) => setSelectedInstitutionFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 cursor-pointer"
                >
                  <option value="all">全部教育机构</option>
                  {uniqueInstitutions.map(([iid, iname]) => (
                    <option key={iid} value={iid}>{iname}</option>
                  ))}
                </select>
              </div>

              {canEditCourse && (
                <button
                  onClick={() => {
                    const newCourse: CourseCurriculum = {
                      id: `course_${Date.now()}`,
                      title: '新编吉他系列专修课程',
                      subtitle: 'Guitar Pro Track',
                      description: '由名师最新编排的体系化吉他进阶大纲。',
                      coverImage: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=600&q=80',
                      level: '进阶专修',
                      totalLessons: 10,
                      totalHours: '8.0 小时',
                      category: '流行独奏',
                      teacherId: currentUser.id,
                      teacherName: currentUser.name,
                      institutionId: currentUser.institutionId || 'inst_001',
                      institutionName: currentUser.institutionName || '柏斯音乐国际教育学院',
                      status: 'draft',
                      version: 'v1.0-draft',
                      versionHistory: [
                        { version: 'v1.0-draft', date: new Date().toISOString().split('T')[0], author: currentUser.name, note: '初始创建' },
                      ],
                      orderIndex: courses.length + 1,
                      chapters: [],
                    };
                    const updated = backendService.saveSingleCourse(newCourse);
                    setCourses(updated);
                    setActiveCourseId(newCourse.id);
                  }}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-[#188065] hover:bg-[#136a53] text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>新建一级课程 (Lesson Track)</span>
                </button>
              )}
            </div>

            {/* Course Selector Tabs */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1">
              {filteredCourses.map((c) => {
                const isSelected = c.id === activeCourse?.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveCourseId(c.id)}
                    className={`px-4 py-2.5 rounded-xl border text-left shrink-0 transition-all cursor-pointer flex items-center space-x-2 ${
                      isSelected
                        ? 'bg-white border-[#188065] shadow-xs ring-1 ring-[#188065]'
                        : 'bg-white/80 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-gray-900">{c.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          c.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {c.version} · {c.status === 'published' ? '已发布' : '草稿'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {c.teacherName} · {c.institutionName}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Course Workspace */}
            {activeCourse && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
                
                {/* Level 1: Course Header Bar */}
                <div className="flex flex-col md:flex-row md:items-start justify-between pb-6 border-b border-gray-200 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        一级类目 · 课程 (Lesson Track)
                      </span>
                      <span className="text-xs text-gray-500">
                        {activeCourse.teacherName} · {activeCourse.institutionName}
                      </span>
                      <span className="text-xs font-mono text-gray-400">
                        版本: {activeCourse.version}
                      </span>
                    </div>

                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                      {activeCourse.title}
                    </h2>
                    <p className="text-xs text-gray-600 max-w-2xl leading-relaxed">
                      {activeCourse.description}
                    </p>

                    <div className="flex items-center space-x-4 text-xs text-gray-500 pt-1 font-medium">
                      <span>难度：<strong className="text-gray-800">{activeCourse.level}</strong></span>
                      <span>·</span>
                      <span>总节数：<strong className="text-gray-800">{activeCourse.chapters.reduce((sum, c) => sum + c.items.length, 0)} 节</strong></span>
                      <span>·</span>
                      <span>课时：<strong className="text-gray-800">{activeCourse.totalHours}</strong></span>
                    </div>
                  </div>

                  {/* Course Status & Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Version History Button */}
                    <button
                      onClick={() => setShowVersionHistoryModal(true)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-gray-500" />
                      <span>版本历史 ({activeCourse.versionHistory.length})</span>
                    </button>

                    {canEditCourse ? (
                      <>
                        <button
                          onClick={() => handleOpenEditCourse(activeCourse)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                          title="编辑一级课程标题、介绍、难度与课时"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>编辑课程信息</span>
                        </button>

                        <button
                          onClick={() => setShowPublishModal(true)}
                          className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#188065] hover:bg-[#136a53] text-white rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>发布/更新版本</span>
                        </button>

                        <button
                          onClick={handleArchiveCourse}
                          className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                          title="归档此课程"
                        >
                          <Archive className="w-3.5 h-3.5 text-gray-500" />
                          <span>归档</span>
                        </button>

                        <button
                          onClick={() => setCourseToDelete(activeCourse)}
                          className="flex items-center space-x-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                          title="彻底删除此课程"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>删除</span>
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        <span>只读模式（仅负责教师/超管可编辑）</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Level 2 & 3: Chapters & Section Contents */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-emerald-700" />
                      <span>课程章节架构 ({activeCourse.chapters.length} 章)</span>
                    </h3>

                    {canEditCourse && (
                      <button
                        onClick={handleAddChapter}
                        className="flex items-center space-x-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>添加新章节 (Chapter)</span>
                      </button>
                    )}
                  </div>

                  {activeCourse.chapters.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-xl text-gray-500 text-xs">
                      当前课程暂无章节，点击上方 “添加新章节” 开启编排。
                    </div>
                  ) : (
                    activeCourse.chapters.map((chapter, chapIdx) => (
                      <div
                        key={chapter.id}
                        className="bg-[#fcfdfd] border border-gray-200 rounded-xl p-4 sm:p-5 space-y-3 shadow-2xs"
                      >
                        {/* Level 2 Chapter Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-2">
                              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                                二级类目 · Chapter 0{chapIdx + 1}
                              </span>
                              <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                                {chapter.category}
                              </span>
                              <span className="text-xs text-gray-400">
                                预计耗时: {chapter.totalDuration}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-gray-900">
                              {chapter.title}
                            </h4>
                            <p className="text-xs text-gray-500">
                              {chapter.description}
                            </p>
                          </div>

                          {/* Re-order & Chapter Actions */}
                          {canEditCourse && (
                            <div className="flex items-center space-x-1 shrink-0">
                              <button
                                onClick={() => handleMoveChapter(chapter.id, 'up')}
                                disabled={chapIdx === 0}
                                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                                title="向上移动章节"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveChapter(chapter.id, 'down')}
                                disabled={chapIdx === activeCourse.chapters.length - 1}
                                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                                title="向下移动章节"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenEditChapter(chapter)}
                                className="flex items-center space-x-1 text-xs font-semibold text-gray-700 hover:text-emerald-700 bg-white hover:bg-gray-50 border border-gray-200 rounded px-2 py-1 transition-all cursor-pointer"
                                title="编辑二级章节标题、类目与说明"
                              >
                                <Edit3 className="w-3 h-3 text-emerald-600" />
                                <span>编辑章节</span>
                              </button>
                              <button
                                onClick={() => setTargetChapterForNewItem(chapter.id)}
                                className="flex items-center space-x-1 text-xs font-semibold text-emerald-800 hover:text-white hover:bg-[#188065] border border-emerald-300 rounded px-2 py-1 transition-all cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>添加三级内容</span>
                              </button>
                              <button
                                onClick={() => handleDeleteChapter(chapter.id)}
                                className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                                title="删除章节"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Level 3: Chapter Items List */}
                        <div className="space-y-2 pl-1 sm:pl-3">
                          {chapter.items.length === 0 ? (
                            <div className="text-xs text-gray-400 py-2 italic">
                              暂无三级组合内容，请点击 “添加三级内容” 关联视频打点、和弦微测或 AI 交互式乐谱。
                            </div>
                          ) : (
                            chapter.items.map((item, itemIdx) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 bg-white border border-gray-200/80 rounded-lg hover:border-gray-300 transition-all text-xs"
                              >
                                <div className="flex items-center space-x-2.5 min-w-0">
                                  {item.type === 'video' && (
                                    <div className="w-6 h-6 rounded bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                                      <Video className="w-3.5 h-3.5" />
                                    </div>
                                  )}
                                  {item.type === 'chord_drill' && (
                                    <div className="w-6 h-6 rounded bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                      <Sliders className="w-3.5 h-3.5" />
                                    </div>
                                  )}
                                  {item.type === 'transcription_score' && (
                                    <div className="w-6 h-6 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                      <Music className="w-3.5 h-3.5" />
                                    </div>
                                  )}

                                  <div className="truncate">
                                    <div className="flex items-center space-x-1.5 truncate">
                                      <span className="font-bold text-gray-900 truncate">
                                        {item.title}
                                      </span>
                                      {item.type === 'video' && (
                                        videos.find((v) => v.id === item.videoId)?.status === 'published' ? (
                                          <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-semibold shrink-0">教学视频</span>
                                        ) : (
                                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-semibold shrink-0 flex items-center space-x-0.5">
                                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                                            <span>视频未发布</span>
                                          </span>
                                        )
                                      )}
                                      {item.type === 'chord_drill' && (
                                        drills.find((d) => d.id === item.chordDrillId)?.status === 'published' ? (
                                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-semibold shrink-0">和弦微测</span>
                                        ) : (
                                          <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.2 rounded font-semibold shrink-0 flex items-center space-x-0.5">
                                            <AlertTriangle className="w-3 h-3 text-red-600" />
                                            <span>走向未发布</span>
                                          </span>
                                        )
                                      )}
                                      {item.type === 'transcription_score' && (
                                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold shrink-0">曲谱库练习谱</span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-gray-500 truncate">
                                      {item.description}
                                      {item.cuePoints && ` · 带 ${item.cuePoints.length} 处微课关键打点`}
                                      {item.chords && ` · 和弦: ${item.chords.join(' → ')}`}
                                      {item.scoreTitle && ` · 练习谱: ${item.scoreTitle}`}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-1 shrink-0 ml-2">
                                  {item.type === 'chord_drill' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const d = drills.find((dr) => dr.id === item.chordDrillId) || null;
                                        setPreviewingChordDrill({ item, drill: d });
                                      }}
                                      className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold cursor-pointer transition-colors mr-1"
                                      title="预览体验学员端和弦指法与拾音比对微测"
                                    >
                                      🎹 试测和弦
                                    </button>
                                  )}
                                  {item.type === 'transcription_score' && (
                                    <button
                                      type="button"
                                      disabled={!hasBoundScore(item)}
                                      onClick={() => {
                                        const targetScore = resolveScoreForItem(item);
                                        // 没绑谱时按钮已置灰，这里是第二道防线
                                        if (!targetScore) return;
                                        onSelectSong(targetScore, {
                                          courseId: activeCourse.id,
                                          courseTitle: activeCourse.title,
                                          chapterId: chapter.id,
                                          chapterTitle: chapter.title,
                                          itemId: item.id,
                                          itemTitle: item.title,
                                          fromRole: currentUser.role,
                                          isCMS: true,
                                        });
                                      }}
                                      className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold cursor-pointer transition-colors mr-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-50"
                                      title={
                                        hasBoundScore(item)
                                          ? '在交互式乐谱工作台立即开始试奏（支持返回课程大纲）'
                                          : '本条目尚未绑定练习曲谱 —— 请在「编辑内容」里为它选择一首曲库曲谱'
                                      }
                                    >
                                      🎸 试奏此谱
                                    </button>
                                  )}
                                  {canEditCourse && (
                                    <>
                                      <button
                                        onClick={() => handleMoveItem(chapter.id, item.id, 'up')}
                                        disabled={itemIdx === 0}
                                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                                      >
                                        <ArrowUp className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleMoveItem(chapter.id, item.id, 'down')}
                                        disabled={itemIdx === chapter.items.length - 1}
                                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                                      >
                                        <ArrowDown className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleOpenEditItem(chapter.id, item)}
                                        className="p-1 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer transition-colors"
                                        title="编辑更新三级具体内容"
                                      >
                                        <Edit3 className="w-3 h-3 text-emerald-600" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(chapter.id, item.id)}
                                        className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                      </div>
                    ))
                  )}
                </div>

              </div>
            )}

          </div>
          )
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 教学视频与关键打点 (VIDEOS & CUE MARKERS) */}
        {/* ========================================================================= */}
        {currentTab === 'videos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left 5 cols: Video Roster & Upload form */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-2xs space-y-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Video className="w-4 h-4 text-rose-600" />
                  <span>教学视频资源库 ({videos.length})</span>
                </h3>

                {/* Video list */}
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {videos.map((vid) => {
                    const isSelected = vid.id === selectedVideoForCuePoints?.id;
                    const isPub = vid.status === 'published';
                    return (
                      <div
                        key={vid.id}
                        onClick={() => setSelectedVideoForCuePoints(vid)}
                        className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-rose-50/40 border-rose-400 ring-1 ring-rose-400 shadow-xs'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                            {vid.category}
                          </span>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-gray-400 text-[10px]">时长: {vid.durationFormatted}</span>
                            {isPub ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                                已发布
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                                草稿
                              </span>
                            )}
                          </div>
                        </div>

                        <h4 className="text-xs font-bold text-gray-900 line-clamp-1">
                          {vid.title}
                        </h4>

                        <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1.5 pt-1.5 border-t border-gray-100">
                          <span className="truncate max-w-[130px]" title={vid.videoUrl}>
                            {vid.videoSourceType === 'upload' ? '📁 本地上传' : '🔗 网络链接'} · {vid.cuePoints.length} 个打点
                          </span>
                          
                          {canEditCourse && (
                            <div className="flex items-center space-x-1 shrink-0 ml-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleVideoPublish(vid);
                                }}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                                  isPub
                                    ? 'bg-gray-100 hover:bg-amber-100 text-gray-600 hover:text-amber-800 border-gray-200'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                                }`}
                                title={isPub ? '转为草稿（取消发布）' : '发布上线供大纲绑定'}
                              >
                                {isPub ? '取消发布' : '发布'}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteVideoClick(vid);
                                }}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors"
                                title="删除视频素材（已发布视频需先取消发布）"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Upload New Video Form */}
                {canEditCourse && (
                  <form onSubmit={handleAddVideo} className="pt-3 border-t border-gray-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-gray-800 flex items-center space-x-1">
                        <Plus className="w-3.5 h-3.5 text-rose-600" />
                        <span>创建/上传新教学视频</span>
                      </h4>
                      <span className="text-[10px] text-gray-400">支持链接引用或本地上传</span>
                    </div>

                    <input
                      type="text"
                      value={newVideoTitle}
                      onChange={(e) => setNewVideoTitle(e.target.value)}
                      placeholder="视频标题 (例如: F大横按秒按发力技巧)"
                      required
                      className="w-full bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newVideoCategory}
                        onChange={(e) => setNewVideoCategory(e.target.value)}
                        placeholder="类目 (如: 扫弦/独奏/指法)"
                        className="w-full bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 text-xs text-gray-800"
                      />
                      <input
                        type="text"
                        value={newVideoDesc}
                        onChange={(e) => setNewVideoDesc(e.target.value)}
                        placeholder="视频教学重点简述"
                        className="w-full bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 text-xs text-gray-800"
                      />
                    </div>

                    {/* Source Tab Toggle */}
                    <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setVideoSourceTab('link');
                          setVideoValidationStatus({ isValid: null, message: '' });
                        }}
                        className={`flex-1 py-1 text-center rounded-md transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                          videoSourceTab === 'link' ? 'bg-white text-rose-700 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <LinkIcon className="w-3 h-3" />
                        <span>网络视频链接</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoSourceTab('upload');
                          setVideoValidationStatus({ isValid: null, message: '' });
                        }}
                        className={`flex-1 py-1 text-center rounded-md transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                          videoSourceTab === 'upload' ? 'bg-white text-rose-700 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Upload className="w-3 h-3" />
                        <span>本地视频上传</span>
                      </button>
                    </div>

                    {/* Link Source Inputs */}
                    {videoSourceTab === 'link' ? (
                      <div className="space-y-2">
                        {/* Preset quick test buttons */}
                        <div className="space-y-1">
                          <span className="text-[10px] text-gray-400 block">快捷引用示例：</span>
                          <div className="flex flex-wrap gap-1">
                            {[
                              { label: '微信视频号教程', url: 'https://weixin.qq.com/sph/sample_guitar_strumming.mp4' },
                              { label: '抖音指弹精讲', url: 'https://v.douyin.com/sample_sweep_master.mp4' },
                              { label: '小红书独奏拆解', url: 'https://xhslink.com/sample_fingerstyle_tutorial.mp4' },
                              { label: '官方Mixkit实操', url: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-playing-acoustic-guitar-41270-large.mp4' }
                            ].map((preset, pIdx) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => {
                                  setNewVideoUrl(preset.url);
                                  setVideoValidationStatus(validateVideoUrlString(preset.url));
                                }}
                                className="text-[10px] px-2 py-0.5 rounded bg-gray-100 hover:bg-rose-50 hover:text-rose-700 text-gray-600 border border-gray-200 cursor-pointer"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex space-x-1.5">
                          <input
                            type="text"
                            value={newVideoUrl}
                            onChange={(e) => {
                              setNewVideoUrl(e.target.value);
                              if (videoValidationStatus.message) {
                                setVideoValidationStatus({ isValid: null, message: '' });
                              }
                            }}
                            placeholder="输入抖音/微信视频/小红书/B站或MP4视频链接"
                            required={videoSourceTab === 'link'}
                            className="flex-1 bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 text-xs text-gray-800"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const check = validateVideoUrlString(newVideoUrl);
                              setVideoValidationStatus(check);
                            }}
                            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-semibold cursor-pointer shrink-0"
                          >
                            验证有效性
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Upload Source Inputs */
                      <div className="space-y-1.5">
                        <label className="block border-2 border-dashed border-gray-200 hover:border-rose-400 bg-gray-50 hover:bg-rose-50/20 rounded-lg p-3 text-center cursor-pointer transition-colors">
                          <Upload className="w-5 h-5 mx-auto text-gray-400 mb-1" />
                          <span className="text-xs font-semibold text-gray-700 block">
                            {uploadedVideoFile ? `已选择: ${uploadedVideoFile.name}` : '点击选择本地视频文件'}
                          </span>
                          <span className="text-[10px] text-gray-400 block mt-0.5">
                            支持 MP4, WebM, MOV, OGG (最大 500MB)
                          </span>
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/ogg"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setUploadedVideoFile(file);
                                const blobUrl = URL.createObjectURL(file);
                                setUploadedVideoUrl(blobUrl);
                                setVideoValidationStatus({
                                  isValid: true,
                                  message: `✓ 本地视频「${file.name}」已就绪 (${(file.size / 1024 / 1024).toFixed(1)}MB)，格式有效！`,
                                });
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}

                    {/* Validation Status Notice */}
                    {videoValidationStatus.message && (
                      <div className={`p-2 rounded text-[11px] flex items-center space-x-1.5 ${
                        videoValidationStatus.isValid
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {videoValidationStatus.isValid ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span>{videoValidationStatus.message}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>保存视频并在右侧播放预览</span>
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Right 7 cols: Cue Points Timeline Manager */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-gray-900">
                      {selectedVideoForCuePoints?.title}
                    </h3>
                    {selectedVideoForCuePoints?.status === 'published' ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                        🟢 已发布
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                        🟡 草稿 (未发布)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedVideoForCuePoints?.description || '教学视频录像与关键帧打点标注'}
                  </p>
                </div>

                {canEditCourse && selectedVideoForCuePoints && (
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleVideoPublish(selectedVideoForCuePoints)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        selectedVideoForCuePoints.status === 'published'
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                      }`}
                    >
                      {selectedVideoForCuePoints.status === 'published' ? '取消发布(设为草稿)' : '正式发布上线'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditCurrentVideo(selectedVideoForCuePoints)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 flex items-center space-x-1 cursor-pointer"
                      title="修改视频源链接或重新上传覆盖"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-rose-600" />
                      <span>修改/覆盖视频</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVideoClick(selectedVideoForCuePoints)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-200 cursor-pointer"
                      title="删除此视频（需先取消发布）"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Current Video Source & Link Details Box */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700 flex items-center space-x-1">
                    <LinkIcon className="w-3.5 h-3.5 text-gray-500" />
                    <span>当前视频播放源：</span>
                  </span>
                  <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                    {selectedVideoForCuePoints?.videoSourceType === 'upload' ? '本地上传视频' : '网络引用视频'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-gray-800 bg-white p-2 rounded border border-gray-200 break-all select-all">
                  {selectedVideoForCuePoints?.videoUrl}
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-0.5">
                  <span>
                    所属类目: <strong>{selectedVideoForCuePoints?.category}</strong> · 时长: <strong>{selectedVideoForCuePoints?.durationFormatted}</strong>
                  </span>
                  <span>
                    大纲绑定权限: {selectedVideoForCuePoints?.status === 'published' ? (
                      <strong className="text-emerald-700">✓ 已允许在课程大纲中绑定</strong>
                    ) : (
                      <strong className="text-amber-700">⚠️ 需点击右上角「正式发布」后方可绑定</strong>
                    )}
                  </span>
                </div>
              </div>

              {/* Inline Edit / Overwrite Current Video Panel */}
              {isEditingCurrentVideo && selectedVideoForCuePoints && (
                <form onSubmit={handleSaveEditCurrentVideo} className="p-4 bg-rose-50/40 border border-rose-200 rounded-xl space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-gray-900 flex items-center space-x-1.5">
                      <Edit3 className="w-4 h-4 text-rose-600" />
                      <span>修改视频信息或覆盖新视频源</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsEditingCurrentVideo(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-700 block mb-1">视频标题</label>
                      <input
                        type="text"
                        value={editVideoTitle}
                        onChange={(e) => setEditVideoTitle(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-700 block mb-1">分类</label>
                      <input
                        type="text"
                        value={editVideoCategory}
                        onChange={(e) => setEditVideoCategory(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900"
                      />
                    </div>
                  </div>

                  {/* Edit Source Switcher */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-semibold text-gray-700 block">修改或重新上传视频覆盖源：</label>
                    <div className="flex rounded-lg bg-white p-0.5 border border-gray-200 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setEditVideoSourceTab('link')}
                        className={`flex-1 py-1 rounded transition-colors cursor-pointer ${
                          editVideoSourceTab === 'link' ? 'bg-rose-600 text-white' : 'text-gray-600'
                        }`}
                      >
                        更新网络视频链接
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditVideoSourceTab('upload')}
                        className={`flex-1 py-1 rounded transition-colors cursor-pointer ${
                          editVideoSourceTab === 'upload' ? 'bg-rose-600 text-white' : 'text-gray-600'
                        }`}
                      >
                        上传新视频覆盖当前视频
                      </button>
                    </div>

                    {editVideoSourceTab === 'link' ? (
                      <div className="flex space-x-1.5 pt-1">
                        <input
                          type="text"
                          value={editVideoUrl}
                          onChange={(e) => setEditVideoUrl(e.target.value)}
                          placeholder="输入新的视频链接 (引用抖音/微信视频/小红书/MP4)"
                          className="flex-1 bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900"
                        />
                        <button
                          type="button"
                          onClick={() => setEditValidationStatus(validateVideoUrlString(editVideoUrl))}
                          className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-semibold cursor-pointer shrink-0"
                        >
                          验证格式
                        </button>
                      </div>
                    ) : (
                      <div className="pt-1">
                        <label className="block border border-dashed border-gray-300 bg-white hover:bg-rose-50/30 rounded-lg p-2.5 text-center cursor-pointer">
                          <span className="text-xs font-semibold text-gray-700 block">
                            {editUploadedFile ? `新视频已选: ${editUploadedFile.name}` : '选择新的本地视频文件覆盖原视频'}
                          </span>
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/ogg"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                setEditUploadedFile(f);
                                const u = URL.createObjectURL(f);
                                setEditUploadedUrl(u);
                                setEditValidationStatus({ isValid: true, message: `✓ 新文件「${f.name}」已准备覆盖，格式解析有效` });
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}

                    {editValidationStatus.message && (
                      <div className={`p-2 rounded text-[11px] flex items-center space-x-1.5 ${
                        editValidationStatus.isValid
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {editValidationStatus.isValid ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span>{editValidationStatus.message}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end space-x-2 pt-2 border-t border-rose-200/60">
                    <button
                      type="button"
                      onClick={() => setIsEditingCurrentVideo(false)}
                      className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded text-xs cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold cursor-pointer shadow-xs"
                    >
                      确认覆盖更新
                    </button>
                  </div>
                </form>
              )}

              {/* Video Player Preview */}
              <div className="relative rounded-xl overflow-hidden bg-black/90 aspect-video flex items-center justify-center text-white text-xs shadow-inner">
                <video
                  key={selectedVideoForCuePoints?.videoUrl}
                  src={selectedVideoForCuePoints?.videoUrl}
                  controls
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Add New Cue Point Bar */}
              {canEditCourse && (
                <div className="flex items-center space-x-2 pt-2">
                  <div className="flex items-center space-x-1 shrink-0 text-xs text-gray-600">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span>秒数:</span>
                    <input
                      type="number"
                      min={0}
                      value={newCueTimeSeconds}
                      onChange={(e) => setNewCueTimeSeconds(parseInt(e.target.value) || 0)}
                      className="w-16 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 text-center"
                    />
                  </div>

                  <input
                    type="text"
                    value={newCueLabel}
                    onChange={(e) => setNewCueLabel(e.target.value)}
                    placeholder="打点要领说明 (如: 食指微侧面接触琴弦)"
                    className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-800"
                  />

                  <button
                    onClick={handleAddCuePoint}
                    className="px-3.5 py-1.5 bg-[#188065] hover:bg-[#136a53] text-white rounded text-xs font-bold cursor-pointer shrink-0"
                  >
                    添加打点
                  </button>
                </div>
              )}

              {/* Cue Point List */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-gray-500 font-semibold px-1">
                  <span>微课打点时间线 ({selectedVideoForCuePoints?.cuePoints.length || 0} 个打点)</span>
                  <span className="text-[11px] text-gray-400">学员跟练时将毫秒级同步提示</span>
                </div>

                {selectedVideoForCuePoints?.cuePoints.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                    暂无打点标记，可在上方输入秒数与技巧要领进行添加
                  </div>
                ) : (
                  selectedVideoForCuePoints?.cuePoints.map((cue) => (
                    <div
                      key={cue.id}
                      className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className="px-2 py-0.5 bg-rose-600 text-white rounded font-mono font-bold text-[11px]">
                          {cue.timeFormatted}
                        </span>
                        <span className="font-semibold text-gray-900">{cue.label}</span>
                      </div>

                      {canEditCourse && (
                        <button
                          onClick={() => handleDeleteCuePoint(cue.id)}
                          className="text-gray-400 hover:text-red-500 p-1 cursor-pointer"
                          title="删除打点"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 和弦微测与 BPM 阶梯 (TWO-TIER CHORD GENERATOR & DRILLS) */}
        {/* ========================================================================= */}
        {currentTab === 'chords' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left 7 cols: Two-tier Chord Selector & Combination Builder */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 p-5 shadow-2xs space-y-5">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-emerald-700" />
                  <span>两层级和弦生成矩阵与微测构建</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  第一层选择根音，第二层选择和弦属性，快速组合生成专属吉他练习章节。
                </p>
              </div>

              {/* Tier 1: Root Notes */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-gray-700">
                  第一层 · 根音选择 (Root Notes):
                </span>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {CHORD_ROOT_NOTES.map((root) => {
                    const isSelected = selectedRootNote === root;
                    return (
                      <button
                        key={root}
                        onClick={() => {
                          setSelectedRootNote(root);
                          handlePlayChordRoot(root);
                        }}
                        className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#188065] text-white border-[#188065] shadow-xs'
                            : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                        }`}
                      >
                        {root}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tier 2: Chord Qualities */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-gray-700">
                  第二层 · 和弦属性 (Qualities):
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {CHORD_QUALITIES.map((quality) => {
                    const isSelected = selectedChordQuality === quality;
                    return (
                      <button
                        key={quality}
                        onClick={() => setSelectedChordQuality(quality)}
                        className={`py-2 px-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-500 shadow-2xs font-bold'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {quality}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add Chord to Sequence action */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">当前选择:</span>
                  <span className="text-base font-black text-emerald-800 font-mono">
                    {selectedChordQuality === 'major' 
                      ? selectedRootNote 
                      : selectedChordQuality === 'minor' 
                        ? `${selectedRootNote}m` 
                        : `${selectedRootNote}${selectedChordQuality}`}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePlayChordRoot(selectedRootNote)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>试听音高</span>
                  </button>
                  <button
                    onClick={handleAddChordToSequence}
                    className="flex items-center space-x-1.5 px-4 py-1.5 bg-[#188065] hover:bg-[#136a53] text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>加入当前和弦组合</span>
                  </button>
                </div>
              </div>

              {/* Current Chord Sequence Builder */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                {selectedDrillId ? (
                  <div className="flex items-center justify-between p-2.5 bg-emerald-100/70 border border-emerald-300 rounded-lg text-xs text-emerald-950">
                    <span className="font-bold flex items-center space-x-1.5 min-w-0">
                      <Edit3 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="truncate">当前选定走向：<strong>{drills.find((d) => d.id === selectedDrillId)?.title}</strong></span>
                    </span>
                    <button
                      type="button"
                      onClick={handleStartCreateNewDrill}
                      className="text-xs text-emerald-800 hover:text-emerald-950 underline font-semibold cursor-pointer shrink-0 ml-2"
                      title="清空当前选定并切换为创建新走向"
                    >
                      + 新建空白走向
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-950">
                    <span className="font-bold flex items-center space-x-1.5">
                      <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>新建和弦走向模式（可选择右侧走向载入，或编辑完成后保存为新走向）</span>
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800">
                    当前编排和弦链 ({currentChordSequence.length} 个):
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentChordSequence([])}
                    className="text-[11px] text-gray-500 hover:text-red-600 cursor-pointer"
                  >
                    清空组合
                  </button>
                </div>

                {currentChordSequence.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                    请从上方矩阵选择和弦添加至此
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {currentChordSequence.map((chord, idx) => (
                      <div
                        key={idx}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg shadow-2xs font-mono font-bold text-sm text-gray-900"
                      >
                        <span>{chord}</span>
                        <button
                          type="button"
                          onClick={() => setCurrentChordSequence(currentChordSequence.filter((_, i) => i !== idx))}
                          className="text-gray-400 hover:text-red-500 text-xs ml-1 cursor-pointer"
                          title="移除此和弦"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* BPM Ladder Controls */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                      练习组合名称
                    </label>
                    <input
                      type="text"
                      value={chordDrillTitle}
                      onChange={(e) => setChordDrillTitle(e.target.value)}
                      placeholder="走向名称"
                      className="w-full bg-white border border-gray-300 rounded px-2.5 py-1 text-xs text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                      起始速度 (BPM)
                    </label>
                    <input
                      type="number"
                      value={chordBpmStart}
                      onChange={(e) => setChordBpmStart(parseInt(e.target.value) || 60)}
                      className="w-full bg-white border border-gray-300 rounded px-2.5 py-1 text-xs text-gray-900 text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                      达标阶梯速度 (BPM)
                    </label>
                    <input
                      type="number"
                      value={chordBpmTarget}
                      onChange={(e) => setChordBpmTarget(parseInt(e.target.value) || 120)}
                      className="w-full bg-white border border-gray-300 rounded px-2.5 py-1 text-xs text-gray-900 text-center"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {drillSuccessMsg ? (
                    <span className="text-xs text-emerald-700 font-semibold">{drillSuccessMsg}</span>
                  ) : <span />}

                  <div className="flex items-center space-x-2 shrink-0">
                    {selectedDrillId ? (
                      <>
                        <button
                          type="button"
                          onClick={handleCancelEditDrill}
                          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                          title="还原为当前走向保存时的内容"
                        >
                          还原修改
                        </button>
                        <button
                          type="button"
                          onClick={handleStartCreateNewDrill}
                          className="px-2.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                          title="取消当前走向选中状态，进入新建走向模式"
                        >
                          取消选定
                        </button>
                        <button
                          type="button"
                          onClick={handleUpdateExistingDrill}
                          disabled={currentChordSequence.length === 0}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center space-x-1 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>保存更新走向</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveChordCombination}
                          disabled={currentChordSequence.length === 0}
                          className="px-3.5 py-2 bg-[#188065] hover:bg-[#136a53] disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                          title="以当前编排另存为新走向卡片"
                        >
                          另存为新走向
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSaveChordCombination}
                        disabled={currentChordSequence.length === 0}
                        className="px-5 py-2 bg-[#188065] hover:bg-[#136a53] disabled:opacity-40 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center space-x-1.5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>保存为可用和弦微测组合</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Right 5 cols: Saved Chord Drills List */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Music className="w-4 h-4 text-emerald-700" />
                  <span>已建和弦练习走向库 ({drills.length})</span>
                </h3>

                {canManageChords && (
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleStartCreateNewDrill}
                      className="flex items-center space-x-1 text-xs font-semibold px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors cursor-pointer"
                      title="清空左侧并切换为创建新和弦走向"
                    >
                      <Plus className="w-3 h-3 text-gray-500" />
                      <span>新建走向</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePublishAllDrills}
                      className="flex items-center space-x-1 text-xs font-bold px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
                      title="一键将所有和弦组合全部正式发布，供课程大纲选用"
                    >
                      <Send className="w-3 h-3 text-emerald-600" />
                      <span>🚀 统一发布</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {drills.map((drill) => {
                  const isSelected = drill.id === selectedDrillId;
                  const isPub = drill.status === 'published';
                  return (
                    <div
                      key={drill.id}
                      onClick={() => handleSelectDrill(drill)}
                      className={`p-3.5 rounded-xl border space-y-2 text-xs transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500 shadow-sm'
                          : 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <h4 className="font-bold text-gray-900 truncate">{drill.title}</h4>
                          {isSelected && (
                            <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold shrink-0">
                              ✓ 当前选用
                            </span>
                          )}
                          {isPub ? (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold shrink-0">
                              已发布
                            </span>
                          ) : (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold shrink-0">
                              草稿
                            </span>
                          )}
                        </div>

                        {canManageChords && (
                          <div className="flex items-center space-x-1 shrink-0 ml-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectDrill(drill);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white hover:bg-emerald-50 text-emerald-700 border-gray-200'
                              }`}
                              title="在左侧编辑修改和弦链"
                            >
                              {isSelected ? '正在编排' : '选用走向'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleDrillStatus(drill.id);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                                isPub
                                  ? 'bg-gray-100 hover:bg-amber-50 text-gray-600 hover:text-amber-800 border-gray-200'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                              }`}
                              title={isPub ? '设为草稿' : '单独发布上线'}
                            >
                              {isPub ? '取消发布' : '单独发布'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDrillClick(drill);
                              }}
                              className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer"
                              title="删除此和弦组合"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {drill.chords.map((c, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded font-mono font-bold text-emerald-900">
                            {c}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-200/80">
                        <span>BPM 阶梯: {drill.bpmStart} → {drill.bpmTarget}</span>
                        <span>
                          {isPub ? '✓ 已可在大纲中绑定' : '⚠️ 需发布后方可绑定'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: 用户组权限与学分管理 (USER ROLES & AFFILIATIONS) */}
        {/* ========================================================================= */}
        {currentTab === 'users' && (isSuperAdmin || isInstitution || isTeacher) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-2xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                  <Users className="w-5 h-5 text-emerald-700" />
                  <span>7 大用户组角色架构与教务关系管理</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isSuperAdmin
                    ? '平台超管视图：查看与审计全局所有机构、教师、学员与注册用户，分配角色与审批 Credits 额度。'
                    : isInstitution
                    ? `机构教务视图：查看与监管旗下所有认证教师与挂靠学员进度及学分 (${currentUser.institutionName || '本校'})。`
                    : `名师工作室视图：查看负责的名下学员进度与练习打卡学分 (${currentUser.name})。`}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPricingModal(true)}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>查看 Pricing 套餐标准</span>
                </button>
              </div>
            </div>

            {/* Success Toast */}
            {assignSuccessToast && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center space-x-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{assignSuccessToast}</span>
              </div>
            )}

            {/* Section 4.1 & 8.1: 超级管理员审批教师/机构 Credits 恢复申请 */}
            {isSuperAdmin && (
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
                    <Zap className="w-4 h-4 text-amber-600" />
                    <span>待审批 Credits 恢复申请 (教师/机构教研额度申请)</span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 bg-amber-200/70 text-amber-950 rounded-full font-bold">
                    {recoveryRequests.filter((r) => r.status === 'pending').length} 条待处理
                  </span>
                </div>

                {recoveryRequests.filter((r) => r.status === 'pending').length === 0 ? (
                  <p className="text-xs text-amber-800/80">
                    暂无待审批的恢复申请。教师或机构点数不足时提交的申请将在此集中呈现。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recoveryRequests
                      .filter((r) => r.status === 'pending')
                      .map((req) => (
                        <div
                          key={req.id}
                          className="bg-white p-3 rounded-lg border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <strong className="text-gray-900">{req.userName}</strong>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                                {req.userRole === 'teacher' ? '认证教师' : '教学机构'}
                              </span>
                              <span className="text-gray-400 font-mono text-[11px]">{req.userEmail}</span>
                            </div>
                            <p className="text-gray-600 text-[11px] leading-relaxed">
                              申请说明: {req.reason} (当前余额: {req.currentCredits} 点)
                            </p>
                            <span className="text-[10px] text-gray-400">{req.createdAt}</span>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = backendService.approveCreditRecovery(req.id, currentUser.name);
                                setRecoveryRequests(updated);
                                setUsers(backendService.getUsers());
                                setAssignSuccessToast(`已批准 ${req.userName} 恢复 5000 Credits 额度！`);
                                setTimeout(() => setAssignSuccessToast(null), 3000);
                              }}
                              className="px-3 py-1.5 bg-[#188065] hover:bg-[#136a53] text-white font-bold rounded-lg text-xs shadow-2xs transition-all cursor-pointer flex items-center space-x-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>一键批准恢复 5000 点</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = backendService.rejectCreditRecovery(req.id);
                                setRecoveryRequests(updated);
                              }}
                              className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              驳回
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Section 8.4: 超管可搜索到指定用户并分配用户组 */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Search Box */}
                <div className="relative min-w-[240px] flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="搜索姓名、邮箱、所属机构或指导名师..."
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                  />
                </div>

                {/* Role Filter */}
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#188065] cursor-pointer"
                >
                  <option value="all">全部用户组角色 ({users.length})</option>
                  <option value="super_admin">👑 超级管理员</option>
                  <option value="institution">🏛️ 教学机构</option>
                  <option value="teacher">🎸 认证教师</option>
                  <option value="student">🎓 挂靠学员</option>
                  <option value="plus">💳 Plus 付费用户</option>
                  <option value="trial_guest">⏳ 14天试用用户</option>
                  <option value="registered">✉️ 普通注册用户</option>
                </select>

                {(userSearchQuery || userRoleFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserSearchQuery('');
                      setUserRoleFilter('all');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
                  >
                    重置筛选
                  </button>
                )}
              </div>

              {isSuperAdmin && (
                <div className="text-right">
                  <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                    超管权限：可搜索任意普通注册用户并分配至机构或名师名下
                  </span>
                </div>
              )}
            </div>

            {/* Users Roster Table (Section 8.3: 按照用户组层级关系显示可见范围) */}
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3">用户姓名 / 账号</th>
                    <th className="py-3 px-3">邮箱 &amp; 联系方式</th>
                    <th className="py-3 px-3">用户组角色 (Role)</th>
                    <th className="py-3 px-3">所属教学机构</th>
                    <th className="py-3 px-3">指导名师</th>
                    <th className="py-3 px-3 text-right">可用 Credits 额度</th>
                    {isSuperAdmin && <th className="py-3 px-3 text-right">教务配置与分配</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {backendService
                    .getVisibleUsers(currentUser)
                    .filter((u) => {
                      const matchRole = userRoleFilter === 'all' || u.role === userRoleFilter;
                      if (!matchRole) return false;
                      if (!userSearchQuery.trim()) return true;
                      const q = userSearchQuery.trim().toLowerCase();
                      return (
                        u.name.toLowerCase().includes(q) ||
                        u.email.toLowerCase().includes(q) ||
                        (u.institutionName && u.institutionName.toLowerCase().includes(q)) ||
                        (u.teacherName && u.teacherName.toLowerCase().includes(q))
                      );
                    })
                    .map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-gray-900">{u.name}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{u.id}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-[11px] text-gray-700">{u.email}</div>
                          {u.phone && <div className="text-[10px] text-gray-400">Tel: {u.phone}</div>}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              u.role === 'super_admin'
                                ? 'bg-purple-100 text-purple-900 border-purple-200'
                                : u.role === 'institution'
                                ? 'bg-amber-100 text-amber-900 border-amber-200'
                                : u.role === 'teacher'
                                ? 'bg-teal-100 text-teal-900 border-teal-200'
                                : u.role === 'student'
                                ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
                                : u.role === 'plus'
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                                : u.role === 'trial_guest'
                                ? 'bg-sky-100 text-sky-900 border-sky-200'
                                : 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}
                          >
                            {u.role === 'super_admin'
                              ? '👑 超级管理员'
                              : u.role === 'institution'
                              ? '🏛️ 教学机构'
                              : u.role === 'teacher'
                              ? '🎸 认证教师'
                              : u.role === 'student'
                              ? '🎓 挂靠学员'
                              : u.role === 'plus'
                              ? '💳 Plus 会员'
                              : u.role === 'trial_guest'
                              ? '⏳ 14天试用'
                              : '✉️ 普通注册'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-700">
                          {u.institutionName || <span className="text-gray-400 italic">独立自由 / 未挂靠</span>}
                        </td>
                        <td className="py-3 px-3 text-gray-700">
                          {u.teacherName || <span className="text-gray-400 italic">未指定名师</span>}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="font-mono font-bold text-emerald-800">
                            {u.isUnlimitedCredits ? '无限额度' : `${u.credits} 点`}
                          </span>
                          <span className="block text-[10px] text-gray-400">
                            {u.isUnlimitedCredits ? '永久豁免' : `配额 ${u.monthlyCreditQuota || 600}c/月`}
                          </span>
                        </td>

                        {isSuperAdmin && (
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setAssignModalUser(u);
                                setAssignRole(u.role);
                                setAssignInstName(u.institutionName || '柏斯音乐国际教育学院');
                                setAssignTeacherName(u.teacherName || '李老师 (认证名师)');
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-800 hover:text-emerald-950 border border-emerald-300 rounded text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                            >
                              分配角色/机构
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="font-bold flex items-center space-x-1">
                <Check className="w-4 h-4 text-emerald-700" />
                <span>用户权限与教务关系持久化状态说明</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                当前大纲、视频打点、和弦组合与用户权限数据已自动持久化存储于本地服务端数据库（`guitarmate_backend_*`）。
                超管分配角色后，学员、教师与机构各端刷新页面即可无缝呈现最新教务关系。
              </p>
            </div>

          </div>
        )}

        {/* MODAL: ASSIGN USER GROUP & AFFILIATIONS (Section 8.4) */}
        {assignModalUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs font-sans animate-in fade-in select-none">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 text-gray-900 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Users className="w-4 h-4 text-emerald-700" />
                  <span>分配用户组与教务关系</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setAssignModalUser(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700 space-y-1">
                <div>目标用户: <strong className="text-gray-950 font-bold">{assignModalUser.name}</strong></div>
                <div>注册邮箱: <span className="font-mono text-gray-600">{assignModalUser.email}</span></div>
                <div>当前角色: <span className="font-semibold text-emerald-800">{assignModalUser.role}</span></div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    分配至目标用户组 (Role)
                  </label>
                  <select
                    value={assignRole}
                    onChange={(e) => setAssignRole(e.target.value as UserRole)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065] cursor-pointer"
                  >
                    <option value="super_admin">👑 超级管理员 (无限 Credits)</option>
                    <option value="institution">🏛️ 教学机构 (5000 Credits)</option>
                    <option value="teacher">🎸 认证教师 (5000 Credits)</option>
                    <option value="student">🎓 挂靠学员 (3000 Credits/月)</option>
                    <option value="plus">💳 Plus 付费用户 (600 Credits/月)</option>
                    <option value="trial_guest">⏳ 14天免费试用用户 (600 Credits)</option>
                    <option value="registered">✉️ 普通注册用户 (0 Credits)</option>
                  </select>
                </div>

                {(assignRole === 'teacher' || assignRole === 'student' || assignRole === 'institution') && (
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      所属教学机构 (Institution)
                    </label>
                    <select
                      value={assignInstName}
                      onChange={(e) => setAssignInstName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065] cursor-pointer"
                    >
                      <option value="柏斯音乐国际教育学院">柏斯音乐国际教育学院</option>
                      <option value="海伦钢琴吉他艺术中心">海伦钢琴吉他艺术中心</option>
                      <option value="独立音乐家吉他工坊">独立音乐家吉他工坊</option>
                      <option value="">独立自由 / 未挂靠机构</option>
                    </select>
                  </div>
                )}

                {assignRole === 'student' && (
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      指导名师 (Teacher)
                    </label>
                    <select
                      value={assignTeacherName}
                      onChange={(e) => setAssignTeacherName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065] cursor-pointer"
                    >
                      <option value="李老师 (认证名师)">李老师 (认证名师 · 柏斯旗下)</option>
                      <option value="王琴师 (指弹独奏家)">王琴师 (指弹独奏家 · 海伦旗下)</option>
                      <option value="陈教授 (古典吉他名师)">陈教授 (古典吉他名师 · 柏斯旗下)</option>
                      <option value="周导师 (摇滚电吉他)">周导师 (摇滚电吉他 · 独立工坊)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setAssignModalUser(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const instId = assignInstName.includes('柏斯') ? 'inst_001' : assignInstName.includes('海伦') ? 'inst_002' : 'inst_003';
                    const teachId = assignTeacherName.includes('李老师') ? 'usr_coach_alex' : assignTeacherName.includes('王琴师') ? 'usr_teacher_wang' : assignTeacherName.includes('陈教授') ? 'usr_teacher_chen' : 'usr_teacher_zhou';

                    const updated = backendService.assignUserGroup(
                      assignModalUser.id,
                      assignRole,
                      {
                        institutionId: instId,
                        institutionName: assignInstName,
                        teacherId: teachId,
                        teacherName: assignTeacherName,
                      }
                    );
                    setUsers(updated);
                    setAssignModalUser(null);
                    setAssignSuccessToast(`成功将 ${assignModalUser.name} 分配为 [${assignRole}]！`);
                    setTimeout(() => setAssignSuccessToast(null), 3000);
                  }}
                  className="px-5 py-2 bg-[#188065] hover:bg-[#136a53] text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  确认保存配置
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* MODAL 1: ADD CONTENT ITEM TO CHAPTER */}
      {targetChapterForNewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              添加三级具体课程内容 (Section Content Item)
            </h3>

            {/* Type selector */}
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setNewItemType('video')}
                className={`py-2 rounded-lg border text-center transition-all cursor-pointer ${
                  newItemType === 'video' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}
              >
                📹 关联打点视频
              </button>
              <button
                type="button"
                onClick={() => setNewItemType('chord_drill')}
                className={`py-2 rounded-lg border text-center transition-all cursor-pointer ${
                  newItemType === 'chord_drill' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}
              >
                🎹 和弦微测组合
              </button>
              <button
                type="button"
                onClick={() => setNewItemType('transcription_score')}
                className={`py-2 rounded-lg border text-center transition-all cursor-pointer ${
                  newItemType === 'transcription_score' ? 'bg-[#188065] text-white border-[#188065]' : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}
              >
                🎼 AI 双行谱互动
              </button>
            </div>

            {/* Custom title */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                内容标题 (选填，留空则自动引用素材名)
              </label>
              <input
                type="text"
                value={newItemCustomTitle}
                onChange={(e) => setNewItemCustomTitle(e.target.value)}
                placeholder="例如: 第 2 小节 F 大横按与 1645 跟练"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800"
              />
            </div>

            {/* Sub content picker */}
            {newItemType === 'video' && (() => {
              const publishedVideos = videos.filter((v) => v.status === 'published');
              if (publishedVideos.length === 0) {
                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                    <div className="font-bold flex items-center space-x-1 text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>暂无已发布的教学视频</span>
                    </div>
                    <p className="leading-relaxed">
                      系统内当前视频均处于草稿状态。根据教学规划要求，视频必须在「教学视频与关键打点」页面正式发布上线后，方可在此选择绑定！
                    </p>
                  </div>
                );
              }
              return (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    选择教学视频素材 (仅已发布视频可供绑定):
                  </label>
                  <select
                    value={selectedVideoIdForNewItem || publishedVideos[0]?.id}
                    onChange={(e) => setSelectedVideoIdForNewItem(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 cursor-pointer"
                  >
                    {publishedVideos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title} · {v.category} ({v.cuePoints.length} 个打点)
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {newItemType === 'chord_drill' && (() => {
              const publishedDrills = drills.filter((d) => d.status === 'published');
              if (publishedDrills.length === 0) {
                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                    <div className="font-bold flex items-center space-x-1 text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>暂无已发布的和弦微测</span>
                    </div>
                    <p className="leading-relaxed">
                      请先前往「和弦微测与BPM阶梯」发布和弦组合（或点击右上角“统一发布全部和弦”），方可在此选择绑定！
                    </p>
                  </div>
                );
              }
              return (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    选择和弦微测走向 (仅已发布走向可供绑定):
                  </label>
                  <select
                    value={selectedDrillIdForNewItem || publishedDrills[0]?.id}
                    onChange={(e) => setSelectedDrillIdForNewItem(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 cursor-pointer"
                  >
                    {publishedDrills.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({d.chords.join(' → ')}) · 目标: {d.bpmTarget} BPM
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {newItemType === 'transcription_score' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  从曲谱库选择要绑定的练习谱：
                </label>
                <select
                  value={selectedScoreIdForNewItem}
                  onChange={(e) => setSelectedScoreIdForNewItem(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 cursor-pointer"
                >
                  {getLibraryItems().map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {item.artist} ({item.tempo} BPM · {item.keySignature})
                    </option>
                  ))}
                </select>
                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <div className="font-bold flex items-center space-x-1">
                    <Music className="w-3.5 h-3.5 text-emerald-700" />
                    <span>已选练习谱：{getLibraryItems().find((s) => s.id === selectedScoreIdForNewItem)?.title}</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    绑定后学员在课程大纲可直接点击「🎸 试奏此谱」，调起互动吉他双行谱播放器与指板同步跟练。
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setTargetChapterForNewItem(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAddItemToChapter}
                className="px-4 py-2 bg-[#188065] hover:bg-[#136a53] text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VERSION HISTORY & ROLLBACK */}
      {showVersionHistoryModal && activeCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                课程版本历史 ({activeCourse.title})
              </h3>
              <span className="text-xs text-gray-500 font-mono">当前: {activeCourse.version}</span>
            </div>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
              {activeCourse.versionHistory.map((vh, idx) => (
                <div key={idx} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 font-mono text-xs">{vh.version}</span>
                    <span className="text-gray-400 text-[11px]">{vh.date}</span>
                  </div>
                  <p className="text-gray-600">{vh.note}</p>
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className="text-gray-400">操作人: {vh.author}</span>
                    {canEditCourse && vh.version !== activeCourse.version && (
                      <button
                        onClick={() => handleRollbackVersion(vh.version)}
                        className="text-emerald-700 font-bold hover:underline cursor-pointer"
                      >
                        回滚至此版本
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowVersionHistoryModal(false)}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PUBLISH NEW VERSION */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              发布与更新大纲版本
            </h3>
            <p className="text-xs text-gray-500">
              系统将自动归档当前状态并递增版本号，所有学员可即时拉取最新大纲。
            </p>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">本次更新说明 (Note)</label>
              <textarea
                value={newVersionNote}
                onChange={(e) => setNewVersionNote(e.target.value)}
                placeholder="例如: 增加了第 2 章 F 大横按微测打点，优化了和弦阶梯挑战走向。"
                rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-800 focus:outline-none"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handlePublishCourse}
                className="px-4 py-2 bg-[#188065] hover:bg-[#136a53] text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                确认正式发布
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: EDIT LEVEL 1 COURSE META (一级课程大纲编辑更新) */}
      {isEditingCourseMeta && activeCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-emerald-600" />
                <span>编辑一级课程大纲信息</span>
              </h3>
              <button
                onClick={() => setIsEditingCourseMeta(false)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCourse} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">课程标题 (Title)</label>
                <input
                  type="text"
                  value={courseFormTitle}
                  onChange={(e) => setCourseFormTitle(e.target.value)}
                  required
                  placeholder="例如: 初学民谣指弹与和弦转换速成"
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">英文/副标题 (Subtitle)</label>
                <input
                  type="text"
                  value={courseFormSubtitle}
                  onChange={(e) => setCourseFormSubtitle(e.target.value)}
                  placeholder="例如: Acoustic Foundations & Chord Transition"
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">难度等级 (Level)</label>
                  <select
                    value={courseFormLevel}
                    onChange={(e) => setCourseFormLevel(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 cursor-pointer"
                  >
                    <option value="零基础 / 初级">零基础 / 初级</option>
                    <option value="入门至进阶">入门至进阶</option>
                    <option value="中级至高级">中级至高级</option>
                    <option value="进阶专修">进阶专修</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">所属类目 (Category)</label>
                  <select
                    value={courseFormCategory}
                    onChange={(e) => setCourseFormCategory(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 cursor-pointer"
                  >
                    <option value="民谣指弹">民谣指弹</option>
                    <option value="流行独奏">流行独奏</option>
                    <option value="电吉他">电吉他</option>
                    <option value="和声乐理">和声乐理</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">课程总节数</label>
                  <input
                    type="number"
                    min={1}
                    value={courseFormLessons}
                    onChange={(e) => setCourseFormLessons(parseInt(e.target.value) || 1)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">预估课时时长</label>
                  <input
                    type="text"
                    value={courseFormHours}
                    onChange={(e) => setCourseFormHours(e.target.value)}
                    placeholder="例如: 8.5 小时"
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">封面图片链接 (Cover Image URL)</label>
                <input
                  type="text"
                  value={courseFormCover}
                  onChange={(e) => setCourseFormCover(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">课程详细介绍 (Description)</label>
                <textarea
                  value={courseFormDesc}
                  onChange={(e) => setCourseFormDesc(e.target.value)}
                  rows={3}
                  placeholder="请输入课程大纲设计目标、适用学员群体与训练要点..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsEditingCourseMeta(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#188065] hover:bg-[#136a53] text-white rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  保存更新
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: EDIT LEVEL 2 CHAPTER (二级章节编辑更新) */}
      {editingChapterData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-emerald-600" />
                <span>编辑二级章节 (Chapter)</span>
              </h3>
              <button
                onClick={() => setEditingChapterData(null)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditChapter} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">章节标题 (Title)</label>
                <input
                  type="text"
                  value={chapterEditTitle}
                  onChange={(e) => setChapterEditTitle(e.target.value)}
                  required
                  placeholder="例如: 第二章 · 核心开放和弦快速转换与微测"
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">章节分类 (Category)</label>
                  <input
                    type="text"
                    value={chapterEditCategory}
                    onChange={(e) => setChapterEditCategory(e.target.value)}
                    placeholder="如: 和弦转换/基本功"
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">预计训练耗时</label>
                  <input
                    type="text"
                    value={chapterEditDuration}
                    onChange={(e) => setChapterEditDuration(e.target.value)}
                    placeholder="如: 45 分钟"
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">章节介绍说明</label>
                <textarea
                  value={chapterEditDesc}
                  onChange={(e) => setChapterEditDesc(e.target.value)}
                  rows={3}
                  placeholder="请输入本章节的学习目标与练习要点..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingChapterData(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#188065] hover:bg-[#136a53] text-white rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  保存更新
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: EDIT LEVEL 3 CONTENT ITEM (三级具体内容编辑更新) */}
      {editingItemData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-emerald-600" />
                <span>编辑三级具体内容</span>
              </h3>
              <button
                onClick={() => setEditingItemData(null)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditItem} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">内容标题 (Title)</label>
                <input
                  type="text"
                  value={itemEditTitle}
                  onChange={(e) => setItemEditTitle(e.target.value)}
                  required
                  placeholder="内容标题"
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#188065]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">说明与要点</label>
                <textarea
                  value={itemEditDesc}
                  onChange={(e) => setItemEditDesc(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2.5 text-gray-900 focus:outline-none"
                />
              </div>

              {editingItemData.item.type === 'video' && (() => {
                const publishedVideos = videos.filter((v) => v.status === 'published');
                return (
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">
                      重新选择或替换教学视频 (仅已发布视频可供选用)
                    </label>
                    {publishedVideos.length === 0 ? (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px]">
                        ⚠️ 暂无可绑定的已发布教学视频。
                      </div>
                    ) : (
                      <select
                        value={itemEditVideoId}
                        onChange={(e) => setItemEditVideoId(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 cursor-pointer"
                      >
                        {publishedVideos.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.title} · {v.category} ({v.cuePoints.length} 个打点)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })()}

              {editingItemData.item.type === 'chord_drill' && (() => {
                const publishedDrills = drills.filter((d) => d.status === 'published');
                return (
                  <div className="space-y-2">
                    <div>
                      <label className="font-bold text-gray-700 block mb-1">重新选择或替换和弦走向</label>
                      <select
                        value={itemEditDrillId}
                        onChange={(e) => setItemEditDrillId(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 cursor-pointer"
                      >
                        {publishedDrills.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title} ({d.chords.join(' → ')})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-gray-700 block mb-1">目标达标阶梯速度 (BPM)</label>
                      <input
                        type="number"
                        min={40}
                        max={240}
                        value={itemEditBpm}
                        onChange={(e) => setItemEditBpm(parseInt(e.target.value) || 100)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                      />
                    </div>
                  </div>
                );
              })()}

              {editingItemData.item.type === 'transcription_score' && (
                <div className="space-y-2">
                  <label className="font-bold text-gray-700 block mb-1">
                    更换或重新绑定曲谱库练习谱
                  </label>
                  <select
                    value={itemEditScoreId}
                    onChange={(e) => setItemEditScoreId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 cursor-pointer"
                  >
                    {getLibraryItems().map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.title} — {sc.artist} ({sc.tempo} BPM · {sc.keySignature})
                      </option>
                    ))}
                  </select>
                  <div className="p-2 bg-emerald-50 rounded border border-emerald-200 text-[11px] text-emerald-800">
                    当前绑定曲谱：《{getLibraryItems().find((s) => s.id === itemEditScoreId)?.title}》，保存后学员即可点击试奏跟练。
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingItemData(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#188065] hover:bg-[#136a53] text-white rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  保存更新
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: DELETE COURSE CONFIRMATION (彻底删除课程确认模态框) */}
      {courseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 border border-red-100 my-auto">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  确认彻底删除课程？
                </h3>
                <p className="text-xs text-gray-500">
                  此操作不可撤销，课程及章节数据将被移除
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl space-y-1.5 text-xs text-gray-800">
              <div>
                课程名称：<strong className="text-red-950 font-bold">{courseToDelete.title}</strong>
              </div>
              <div className="text-gray-600 text-[11px]">
                包含章节：{courseToDelete.chapters.length} 个章节，共 {courseToDelete.chapters.reduce((sum, ch) => sum + ch.items.length, 0)} 节具体训练内容
              </div>
              <p className="text-red-700 text-[11px] pt-1.5 border-t border-red-200 leading-relaxed">
                ⚠️ 从数据库中彻底删除后，属下所有学员将无法再查阅或练习此大纲。
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setCourseToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCourse}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>确认彻底删除</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: DELETE VIDEO CONFIRMATION (彻底删除教学视频确认模态框) */}
      {videoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 border border-red-100 my-auto">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  确认彻底删除教学视频？
                </h3>
                <p className="text-xs text-gray-500">
                  视频及其打点节点将被移除，并自动清理课程绑定
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl space-y-1.5 text-xs text-gray-800">
              <div>
                视频标题：<strong className="text-red-950 font-bold">{videoToDelete.title}</strong>
              </div>
              <div className="text-gray-600 text-[11px]">
                视频分类：{videoToDelete.category} · 时长: {videoToDelete.durationFormatted}
              </div>
              <div className="text-gray-600 text-[11px]">
                关键打点：包含 {videoToDelete.cuePoints.length} 处微课打点标记
              </div>
              <p className="text-red-700 text-[11px] pt-1.5 border-t border-red-200 leading-relaxed">
                ⚠️ 注意：该视频已取消发布。彻底删除后，该视频与所有打点节点将被永久移除，并且所有课程大纲中已绑定此视频的条目将被同步级联清理！
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setVideoToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteVideo}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>确认彻底删除</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 9: DELETE CHORD DRILL CONFIRMATION (删除和弦走向微测确认模态框) */}
      {drillToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 border border-red-100 my-auto">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  确认删除和弦微测走向？
                </h3>
                <p className="text-xs text-gray-500">
                  将从和弦走向库中移除，并清理所有大纲关联
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl space-y-1.5 text-xs text-gray-800">
              <div>
                走向名称：<strong className="text-red-950 font-bold">{drillToDelete.title}</strong>
              </div>
              <div className="text-gray-600 text-[11px]">
                和弦轮换：{drillToDelete.chords.join(' → ')}
              </div>
              <div className="text-gray-600 text-[11px]">
                速度挑战：{drillToDelete.bpmStart} BPM → {drillToDelete.bpmTarget} BPM
              </div>
              <p className="text-red-700 text-[11px] pt-1.5 border-t border-red-200 leading-relaxed">
                ⚠️ 确认删除后，所有在课程大纲中绑定该和弦微测的章节条目将被同步级联清理！
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDrillToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDrill}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>确认删除走向</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING ACTION FEEDBACK BANNER (操作反馈提示条) */}
      {feedbackNotice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 backdrop-blur-md text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-3 border border-gray-700 pointer-events-none">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{feedbackNotice.message}</span>
        </div>
      )}

      {/* Interactive Chord Drill Modal Preview (参考 practice_chor.jpg) */}
      {previewingChordDrill && (
        <InteractiveChordDrillModal
          item={previewingChordDrill.item}
          drill={previewingChordDrill.drill}
          onClose={() => setPreviewingChordDrill(null)}
          onComplete={() => setPreviewingChordDrill(null)}
        />
      )}

      {/* Credits Exceeded Modal for Course Publishing */}
      {exceededCreditsModal.isOpen && (
        <CreditsExceededModal
          isOpen={exceededCreditsModal.isOpen}
          onClose={() => setExceededCreditsModal((prev) => ({ ...prev, isOpen: false }))}
          currentUser={currentUser}
          type={exceededCreditsModal.type}
          requiredCredits={exceededCreditsModal.required}
          onOpenPricing={() => {
            setExceededCreditsModal((prev) => ({ ...prev, isOpen: false }));
            setShowPricingModal(true);
          }}
          onRefreshUser={() => {
            setUsers(backendService.getUsers());
          }}
        />
      )}

      {/* Pricing Plans Modal */}
      {showPricingModal && (
        <PricingPlansView
          isModal={true}
          currentUser={currentUser}
          onClose={() => setShowPricingModal(false)}
        />
      )}

    </div>
  );
};
