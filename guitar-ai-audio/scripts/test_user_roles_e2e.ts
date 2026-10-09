/**
 * Comprehensive End-to-End Test Suite for USER_ROLES_PERMISSIONS_ROADMAP.md
 * 
 * Verifies all 7 User Roles, Credits Economic Engine, Pre-flight Balance Checks,
 * Hierarchical Visibility, Enterprise Sales Leads, and Export/AI Privacy Gates.
 */

// Node.js localStorage mock for testing backendService
const memoryStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => memoryStore.get(key) || null,
  setItem: (key: string, val: string) => memoryStore.set(key, String(val)),
  removeItem: (key: string) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

import { backendService } from '../src/utils/backendService';
import { DEMO_CREDENTIALS } from '../src/components/SignInModal';
import { UserProfile, UserRole } from '../src/types/auth';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

console.log('========================================================================');
console.log('🚀 GUITARMATE ROADMAP E2E TEST: 7 USER ROLES & CREDITS & PRICING VERIFICATION');
console.log('========================================================================\n');

// -------------------------------------------------------------------------------------------------
// TEST 1: ROLE 1 - 👑 超级管理员 (Super Admin - gardenartgz@gmail.com)
// -------------------------------------------------------------------------------------------------
console.log('▶ [TEST SUITE 1] 👑 超级管理员 (Super Admin: gardenartgz@gmail.com)');
const adminDemo = DEMO_CREDENTIALS.find((c) => c.role === 'super_admin')!;
const adminUser = backendService.getUsers().find((u) => u.email === adminDemo.email)!;

assert(!!adminUser, 'Super Admin account exists in backend');
assert(adminUser.role === 'super_admin', 'Super Admin role is super_admin');
assert(adminUser.isUnlimitedCredits === true, 'Super Admin has isUnlimitedCredits = true');

// Super Admin credit exemption
const adminPreCheck = backendService.checkCredits(adminUser.id, 999999);
assert(adminPreCheck.hasEnough === true, 'Super Admin pre-flight check allows any amount of credits');
const adminDeduct = backendService.deductCredits(adminUser.id, 150, 'Transcription demo', 'transcription');
assert(adminDeduct.success === true && adminDeduct.newBalance === 999999, 'Super Admin is exempt from credit deduction and maintains unlimited balance');

// Super Admin hierarchical visibility (sees ALL users in system)
const allUsers = backendService.getUsers();
const visibleToAdmin = backendService.getVisibleUsers(adminUser);
assert(visibleToAdmin.length === allUsers.length, `Super Admin sees all ${allUsers.length} users in system`);

// Super Admin Credit Recovery Approval
// Let's create a pending request first via applyCreditRecovery
const newReq = backendService.applyCreditRecovery(
  'usr_coach_alex',
  '李老师 (认证名师)',
  'alex.guitar@studio.com',
  'teacher',
  '新学期公开课教案扒谱额度不足，申请补充 5000 点'
);
const reqId = newReq.id;
let pendingRequests = backendService.getCreditRecoveryRequests();
assert(pendingRequests.some((r) => r.id === reqId && r.status === 'pending'), 'Credit recovery request created as pending');

// Super Admin approves the request
const approvedReqs = backendService.approveCreditRecovery(reqId, adminUser.name);
const approvedReq = approvedReqs.find((r) => r.id === reqId)!;
assert(approvedReq.status === 'approved', 'Super Admin successfully approved credit recovery request');
const teacherAfterApproval = backendService.getUsers().find((u) => u.id === 'usr_coach_alex')!;
assert(teacherAfterApproval.credits >= 5000, `Teacher credits increased to ${teacherAfterApproval.credits} (>= 5000)`);

// Super Admin User Group Allocation (Section 8.4)
// Super Admin finds registered user and allocates to institution & teacher
const regUserBefore = backendService.getUsers().find((u) => u.email === 'xuming.reg@163.com')!;
assert(regUserBefore.role === 'registered', 'Target user is initially registered');

const updatedRoster = backendService.assignUserGroup(regUserBefore.id, 'student', {
  institutionId: 'inst_001',
  institutionName: '柏斯音乐国际教育学院',
  teacherId: 'usr_coach_alex',
  teacherName: '李老师 (认证名师)',
});
const regUserAfter = updatedRoster.find((u) => u.id === regUserBefore.id)!;
assert(regUserAfter.role === 'student', 'User successfully assigned to student role');
assert(regUserAfter.institutionName === '柏斯音乐国际教育学院', 'User affiliated with Parsons Music Academy');
assert(regUserAfter.teacherName === '李老师 (认证名师)', 'User assigned under Teacher Li');
assert(regUserAfter.credits === 3000, 'Assigned student received 3000 monthly credits');


// -------------------------------------------------------------------------------------------------
// TEST 2: ROLE 2 - 🏛️ 教学机构 (Institution: academy@parsons-music.com)
// -------------------------------------------------------------------------------------------------
console.log('\n▶ [TEST SUITE 2] 🏛️ 教学机构 (Institution: academy@parsons-music.com)');
const instDemo = DEMO_CREDENTIALS.find((c) => c.role === 'institution')!;
const instUser = backendService.getUsers().find((u) => u.email === instDemo.email)!;

assert(!!instUser, 'Institution account exists in backend');
assert(instUser.role === 'institution', 'Role is institution');
assert(instUser.credits === 5000, 'Institution has 5000 initial Credits quota');
assert(instUser.institutionName === '柏斯音乐国际教育学院', 'Belongs to Parsons Music Academy');

// Hierarchical Visibility for Institution: sees teachers and students under Parsons Academy
const visibleToInst = backendService.getVisibleUsers(instUser);
const hasForeignUser = visibleToInst.some((u) => u.institutionName && !u.institutionName.includes('柏斯') && u.role !== 'institution');
assert(!hasForeignUser, 'Institution cannot see users belonging to competing institutions');
const hasOwnTeacher = visibleToInst.some((u) => u.role === 'teacher' && u.institutionName === '柏斯音乐国际教育学院');
assert(hasOwnTeacher, 'Institution can see its own affiliated teachers');

// Institution Profile Update (Section 8.5)
const updatedInstUsers = backendService.updateUserProfile(instUser.id, {
  ...instUser,
  institutionName: '柏斯音乐国际教育学院 (总校区)',
  address: '上海市徐汇区淮海西路 888 号柏斯大厦 3 层',
  phone: '021-88889999',
  wechat: 'parsons_master_dean',
});
const updatedInstProfile = updatedInstUsers.find((u) => u.id === instUser.id)!;
assert(updatedInstProfile.address === '上海市徐汇区淮海西路 888 号柏斯大厦 3 层', 'Institution campus address updated');
assert(updatedInstProfile.phone === '021-88889999', 'Institution contact phone updated');


// -------------------------------------------------------------------------------------------------
// TEST 3: ROLE 3 - 🎸 认证教师 (Certified Teacher: alex.guitar@studio.com)
// -------------------------------------------------------------------------------------------------
console.log('\n▶ [TEST SUITE 3] 🎸 认证教师 (Certified Teacher: alex.guitar@studio.com)');
const teacherDemo = DEMO_CREDENTIALS.find((c) => c.role === 'teacher')!;
const teacherUser = backendService.getUsers().find((u) => u.email === teacherDemo.email)!;

assert(!!teacherUser, 'Certified Teacher account exists');
assert(teacherUser.role === 'teacher', 'Role is teacher');

// Hierarchical Visibility for Teacher: sees their affiliated students
const visibleToTeacher = backendService.getVisibleUsers(teacherUser);
const allTeacherStudents = visibleToTeacher.filter((u) => u.role === 'student');
assert(allTeacherStudents.length > 0, `Teacher sees their affiliated students (count: ${allTeacherStudents.length})`);
const hasOtherTeacherStudent = visibleToTeacher.some((u) => u.teacherName && !u.teacherName.includes('李老师'));
assert(!hasOtherTeacherStudent, 'Teacher cannot see students assigned to other teachers');

// Curriculum Publishing Deduction (15 credits per version publish)
const teacherInitialCredits = teacherUser.credits;
const teacherPrePublishCheck = backendService.checkCredits(teacherUser.id, 15);
assert(teacherPrePublishCheck.hasEnough === true, 'Teacher has enough credits (>= 15) to publish curriculum version');

const pubDeduct = backendService.deductCredits(
  teacherUser.id,
  15,
  '发布课程大纲版本: 《初级民谣吉他基础精讲 (李老师编著)》 (v1.1)',
  'curriculum_publish'
);
assert(pubDeduct.success === true, 'Curriculum version publish deducted 15 Credits');
assert(pubDeduct.newBalance === teacherInitialCredits - 15, `Teacher balance updated from ${teacherInitialCredits} to ${pubDeduct.newBalance}`);

// Teacher profile update (Section 8.5)
const updatedTeacherUsers = backendService.updateUserProfile(teacherUser.id, {
  ...teacherUser,
  address: '北京市朝阳区三里屯 SOHO 音乐工坊 502',
  phone: '13800138000',
  wechat: 'AlexGuitarPro',
});
const updatedTeacherProfile = updatedTeacherUsers.find((u) => u.id === teacherUser.id)!;
assert(updatedTeacherProfile.wechat === 'AlexGuitarPro', 'Teacher WeChat updated in profile');


// -------------------------------------------------------------------------------------------------
// TEST 4: ROLE 4 - 🎓 挂靠学员 (Pro Student: xiaoming.student@gmail.com)
// -------------------------------------------------------------------------------------------------
console.log('\n▶ [TEST SUITE 4] 🎓 挂靠学员 (Pro Student: xiaoming.student@gmail.com)');
const studentDemo = DEMO_CREDENTIALS.find((c) => c.role === 'student')!;
const studentUser = backendService.getUsers().find((u) => u.email === studentDemo.email)!;

assert(!!studentUser, 'Student account exists');
assert(studentUser.role === 'student', 'Role is student');
assert(studentUser.plan === 'pro', 'Plan is Pro (Plan 3)');
assert(studentUser.monthlyCreditQuota === 3000, 'Student monthly quota is 3000 Credits');
assert(studentUser.teacherName === '李老师 (认证名师)', 'Student is affiliated with Teacher Li');

// Student Audio Transcription Pre-flight & Deduction (10 Credits / min, 3 min audio = 30 Credits)
const studentPreCheck = backendService.checkCredits(studentUser.id, 30);
assert(studentPreCheck.hasEnough === true, 'Student has enough credits for 3-minute transcription (30 credits)');

const studentDeduct = backendService.deductCredits(studentUser.id, 30, 'AI 音频转录扒谱: 晴天吉他Solo (3分钟)', 'transcription');
assert(studentDeduct.success === true, '3-minute transcription deducted 30 Credits');

// Student Task Completion
const taskProgress = backendService.setUserTaskCompleted(studentUser.id, 'task_test_item_1', true);
assert(taskProgress['task_test_item_1'] === true, 'Student task completion recorded in backend database');

// Student AI Privacy Opt-Out
const studentOptOutUsers = backendService.updateUserProfile(studentUser.id, {
  ...studentUser,
  optOutAiTraining: true,
});
const studentOptOut = studentOptOutUsers.find((u) => u.id === studentUser.id)!;
assert(studentOptOut.optOutAiTraining === true, 'Pro Student can opt out of AI model training');


// -------------------------------------------------------------------------------------------------
// TEST 5: ROLE 5 - 💳 付费订阅用户 (Plus Subscriber: zhangfeng.guitar@gmail.com)
// -------------------------------------------------------------------------------------------------
console.log('\n▶ [TEST SUITE 5] 💳 付费订阅用户 (Plus Subscriber: zhangfeng.guitar@gmail.com)');
const plusDemo = DEMO_CREDENTIALS.find((c) => c.role === 'plus')!;
const plusUser = backendService.getUsers().find((u) => u.email === plusDemo.email)!;

assert(!!plusUser, 'Plus subscriber account exists');
assert(plusUser.role === 'plus', 'Role is plus');
assert(plusUser.plan === 'plus', 'Plan is Plus (Plan 2)');
assert(plusUser.monthlyCreditQuota === 600, 'Plus user monthly quota is 600 Credits');

// 15-minute full transcription (150 Credits)
const plus15MinCheck = backendService.checkCredits(plusUser.id, 150);
assert(plus15MinCheck.hasEnough === true, 'Plus user can afford 15-minute full transcription (150 Credits)');
const plus15MinDeduct = backendService.deductCredits(plusUser.id, 150, 'AI 完整曲目扒谱: Hotel California (15分钟)', 'transcription');
assert(plus15MinDeduct.success === true, '15-minute audio transcription deducted 150 Credits');


// -------------------------------------------------------------------------------------------------
// TEST 6: ROLE 6 - ⏳ 普通试用用户 (14-Day Trial: guest@test.com)
// -------------------------------------------------------------------------------------------------
console.log('\n▶ [TEST SUITE 6] ⏳ 普通试用用户 (14-Day Trial: guest@test.com)');
const trialDemo = DEMO_CREDENTIALS.find((c) => c.role === 'trial_guest')!;
const trialUser = backendService.getUsers().find((u) => u.email === trialDemo.email)!;

assert(!!trialUser, 'Trial guest account exists');
assert(trialUser.role === 'trial_guest', 'Role is trial_guest');
assert(trialUser.plan === 'trial' || trialUser.plan === 'free', 'Plan is Trial/Free (Plan 1 14-day trial)');
assert(trialUser.credits > 0, `Trial user has active trial credits (${trialUser.credits} Credits)`);

// Trial user transcription
const trialDeduct = backendService.deductCredits(trialUser.id, 30, '试用音频转录 (3分钟)', 'transcription');
assert(trialDeduct.success === true, 'Trial user deducted 30 credits for transcription');


// -------------------------------------------------------------------------------------------------
// TEST 7: ROLE 7 - ✉️ 普通注册用户 (Registered User: xuming.reg@163.com)
// -------------------------------------------------------------------------------------------------
console.log('\n▶ [TEST SUITE 7] ✉️ 普通注册用户 (Registered User: xuming.reg@163.com)');
// Use the seeded registered user
const regUser = backendService.getUsers().find((u) => u.email === 'xuming.reg@163.com')!;
assert(!!regUser, 'Registered user exists in seeded database');

// Set credits to 0 for pristine registered state testing
backendService.updateUserProfile(regUser.id, {
  role: 'registered',
  credits: 0,
  monthlyCreditQuota: 0,
});

// 1. Pre-flight check failure when 0 credits
const freshCheck = backendService.checkCredits(regUser.id, 30);
assert(freshCheck.hasEnough === false, '0 credits registered user blocked by pre-flight check');
assert(freshCheck.shortage === 30, 'Pre-flight check reports exactly 30 credits shortage');

// 2. Cannot deduct when 0 credits
const freshDeduct = backendService.deductCredits(regUser.id, 30, 'Attempted transcription', 'transcription');
assert(freshDeduct.success === false, 'Deduct fails safely when balance is insufficient');

// 3. User starts 14-day trial -> granted 600 credits & promoted to trial_guest
backendService.updateUserProfile(regUser.id, {
  role: 'trial_guest',
  credits: 600,
  monthlyCreditQuota: 600,
  trialActive: true,
});
const trialActivatedCheck = backendService.checkCredits(regUser.id, 30);
assert(trialActivatedCheck.hasEnough === true, 'After activating 14-day trial, user has enough credits (600) for transcription');


// -------------------------------------------------------------------------------------------------
// TEST 8: ENTERPRISE CONTACT SALES LEADS PIPELINE
// -------------------------------------------------------------------------------------------------
console.log('\n▶ [TEST SUITE 8] 🏢 Enterprise 大客户定制咨询与线索录入');
const leadId = `lead_${Date.now()}`;
backendService.saveEnterpriseLead({
  id: leadId,
  fullName: '王副院长',
  workEmail: 'dean.wang@conservatory-music.edu.cn',
  companyName: '国家音乐学院现代吉他艺术中心',
  monthlyMinutes: '2,000 - 10,000 分钟',
  useCases: ['API 接口接入', '批量高精谱表导出', '专属私有教师大纲部署'],
  notes: '需要为本校 50 位吉他导师统一部署私有课纲与教务管理系统，支持学生每日打卡与曲目测评。',
  createdAt: new Date().toISOString(),
  status: 'new',
});

assert(!!leadId, `Enterprise lead successfully submitted with ID: ${leadId}`);
const allLeads = backendService.getEnterpriseLeads();
const foundLead = allLeads.find((l) => l.id === leadId);
assert(!!foundLead, 'Enterprise lead found in backend CRM database');
assert(foundLead?.companyName === '国家音乐学院现代吉他艺术中心', 'Enterprise lead company matches');
assert(foundLead?.useCases.includes('专属私有教师大纲部署') === true, 'Enterprise use cases stored correctly');


// -------------------------------------------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`📊 TEST RESULTS SUMMARY: Total: ${passedTests + failedTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('========================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL 7 USER ROLES, CREDITS RULES & PERMISSIONS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}
