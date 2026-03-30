         COMPLETE API ENDPOINTS REFERENCE 
Here's a comprehensive list of all API endpoints in your Intelli Campus AI system. 
 
     AUTHENTICATION 
Method Endpoint Description Access 
POST /api/auth/login User login Public 
POST /api/auth/logout User logout Authenticated 
GET /api/auth/verify Verify token Authenticated 
 
         SCHOOL MANAGEMENT 
Method Endpoint Description Access 
GET /api/schools Get all schools SUPER_ADMIN 
POST /api/schools Create school SUPER_ADMIN 
GET /api/schools/:id Get school by ID SUPER_ADMIN 
PUT /api/schools/:id Update school SUPER_ADMIN 
DELETE /api/schools/:id Delete school SUPER_ADMIN 
PATCH /api/schools/:id/deactivate Deactivate school SUPER_ADMIN 
 
   USER MANAGEMENT 
Method Endpoint Description Access 
GET /api/users/school-admins Get school admins SUPER_ADMIN 
POST /api/users/school-admins Create school admin SUPER_ADMIN 
PUT /api/users/school-admins/:id Update school admin SUPER_ADMIN 
Method Endpoint Description Access 
DELETE /api/users/school-admins/:id Delete school admin SUPER_ADMIN 
 
                                   TEACHER MANAGEMENT 
Method Endpoint Description Access 
GET /api/admin/teachers Get all teachers SCHOOL_ADMIN 
POST /api/admin/teachers Create teacher SCHOOL_ADMIN 
GET /api/admin/teachers/:id Get teacher by ID SCHOOL_ADMIN 
PUT /api/admin/teachers/:id Update teacher SCHOOL_ADMIN 
DELETE /api/admin/teachers/:id Delete teacher SCHOOL_ADMIN 
GET /api/teacher/profile Get own profile TEACHER, HOMEROOM_TEACHER 
PUT /api/teacher/profile Update own profile TEACHER, HOMEROOM_TEACHER 
 
    CLASS MANAGEMENT 
Method Endpoint Description Access 
GET /api/classes Get all classes SCHOOL_ADMIN 
POST /api/classes Create class SCHOOL_ADMIN 
GET /api/classes/:id Get class by ID SCHOOL_ADMIN, TEACHER 
PUT /api/classes/:id Update class SCHOOL_ADMIN 
DELETE /api/classes/:id Delete class SCHOOL_ADMIN 
 
                           STUDENT MANAGEMENT 
Method Endpoint Description Access 
GET /api/homeroom/students Get students in homeroom HOMEROOM_TEACHER 
POST /api/homeroom/students Create student HOMEROOM_TEACHER 
GET /api/homeroom/students/:id Get student by ID HOMEROOM_TEACHER 
PUT /api/homeroom/students/:id Update student HOMEROOM_TEACHER 
DELETE /api/homeroom/students/:id Delete student HOMEROOM_TEACHER 
 
                                  PARENT MANAGEMENT 
Metho
d Endpoint Descriptio
n Access 
GET /api/homeroom/parents Get 
parents 
HOMEROOM_TEACHE
R 
POST /api/homeroom/parents Create 
parent 
HOMEROOM_TEACHE
R 
GET /api/homeroom/parents/:id Get parent 
by ID 
HOMEROOM_TEACHE
R 
PUT /api/homeroom/parents/:id Update 
parent 
HOMEROOM_TEACHE
R 
DELETE /api/homeroom/parents/:id Delete 
parent 
HOMEROOM_TEACHE
R 
POST /api/homeroom/parents/:parentId/link/:studentId Link parent 
to student 
HOMEROOM_TEACHE
R 
DELETE /api/homeroom/parents/:parentId/unlink/:student
Id 
Unlink 
parent 
from 
student 
HOMEROOM_TEACHE
R 
 
SUBJECT MANAGEMENT 
Method Endpoint 
GET 
/api/subjects 
POST /api/subjects 
GET 
PUT 
/api/subjects/:id 
/api/subjects/:id 
DELETE /api/subjects/:id 
POST /api/subjects/:id/assign-teacher 
DELETE /api/subjects/:id/remove
teacher/:teacherId 
GET 
/api/subjects/list/teachers 
Description 
Get all subjects 
Create subject 
Get subject by ID 
Update subject 
Delete subject 
Access 
SCHOOL_ADMIN 
SCHOOL_ADMIN 
SCHOOL_ADMIN 
SCHOOL_ADMIN 
SCHOOL_ADMIN 
Assign teacher to subject SCHOOL_ADMIN 
Remove teacher from 
subject 
SCHOOL_ADMIN 
Get subjects with teachers SCHOOL_ADMIN 
GRADE SYSTEM 
Grade Components 
Method Endpoint 
GET 
/api/grades/components 
POST /api/grades/components 
PUT 
/api/grades/components/:id 
Description 
Get grade 
components 
Create grade 
component 
Update grade 
component 
Access 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
Method Endpoint 
Description 
Access 
TEACHER, 
DELETE /api/grades/components/:id 
Delete grade 
component 
(hard) 
PATCH /api/grades/components/:id/deactivate Soft delete 
component 
Delete 
DELETE /api/grades/components/:id/marks 
DELETE /api/grades/components/:id/with
marks 
Marks & Grades 
Method Endpoint 
component 
marks only 
Delete 
component 
with marks 
Description 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
Access 
POST /api/grades/marks 
DELETE /api/grades/marks/:markId 
GET 
Enter/update 
student mark 
Delete 
individual mark 
/api/grades/student/:studentId Get student 
grade 
GET 
GET 
GET 
/api/grades/class-report 
/api/grades/rankings 
/api/grades/student
rank/:studentId 
Get class grade 
report 
Get class 
rankings 
Get student rank 
info 
TEACHER, HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, HOMEROOM_TEACHER, 
STUDENT, PARENT, 
SCHOOL_ADMIN 
TEACHER, HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, HOMEROOM_TEACHER, 
STUDENT, PARENT, 
SCHOOL_ADMIN 
 
   STUDENT ATTENDANCE 
Method Endpoint Description Access 
POST /api/attendance Record single 
attendance 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
POST /api/attendance/bulk Record bulk 
attendance 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
GET /api/attendance/class/:classId 
Get class 
attendance for 
date 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
GET /api/attendance/student/:studentId 
Get student 
attendance 
history 
TEACHER, 
HOMEROOM_TEACHER, 
STUDENT, PARENT, 
SCHOOL_ADMIN 
GET /api/attendance/report/class/:classId 
Get class 
attendance 
report 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
DELETE /api/attendance/:attendanceId 
Delete 
attendance 
record 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
 
                                   TEACHER ATTENDANCE 
Method Endpoint Description Access 
POST /api/teacher-attendance Record single teacher 
attendance SCHOOL_ADMIN 
POST /api/teacher-attendance/bulk Record bulk teacher 
attendance SCHOOL_ADMIN 
Method Endpoint 
Description 
Access 
GET 
GET 
GET 
PUT 
/api/teacher-attendance/school 
/api/teacher
attendance/teacher/:teacherId 
/api/teacher-attendance/report 
Get all teachers attendance 
for date 
Get teacher attendance 
history 
Get school attendance 
report 
SCHOOL_ADMIN 
SCHOOL_ADMIN 
SCHOOL_ADMIN 
/api/teacher-attendance/:attendanceId Update teacher attendance SCHOOL_ADMIN 
DELETE /api/teacher-attendance/:attendanceId Delete teacher attendance SCHOOL_ADMIN 
ANNOUNCEMENTS 
Method Endpoint 
GET 
/api/announcements 
POST /api/announcements 
GET 
PUT 
/api/announcements/:id 
/api/announcements/:id 
DELETE /api/announcements/:id 
Description 
Get announcements (role
f
iltered) 
Create announcement 
Get single announcement 
Update announcement 
Delete announcement 
PATCH /api/announcements/:id/deactivate Deactivate announcement 
GET 
/api/announcements/stats/overview Get announcement statistics 
Access 
All 
authenticated 
SCHOOL_ADMIN 
All 
authenticated 
SCHOOL_ADMIN 
SCHOOL_ADMIN 
SCHOOL_ADMIN 
SCHOOL_ADMIN 
MESSAGING 
Method Endpoint 
POST /api/messages 
Description 
Send message 
Access 
All authenticated 
Method Endpoint Description Access 
GET /api/messages/conversations Get recent conversations All authenticated 
GET /api/messages/conversation/:userId Get conversation with user All authenticated 
PUT /api/messages/read/:senderId Mark all messages as read All authenticated 
PUT /api/messages/:messageId/read Mark single message as read All authenticated 
GET /api/messages/unread-count Get unread message count All authenticated 
GET /api/messages/search Search messages All authenticated 
DELETE /api/messages/:messageId Delete message All authenticated 
 
             TIMETABLE MANAGEMENT 
Method Endpoint Description Access 
GET /api/timetable/periods Get period 
configurations All authenticated 
POST /api/timetable Create timetable 
entry SCHOOL_ADMIN 
GET /api/timetable Get all timetables 
(admin view) SCHOOL_ADMIN 
GET /api/timetable/class/:classId Get class timetable All authenticated 
GET /api/timetable/teacher/:teacherId Get teacher 
timetable 
SCHOOL_ADMIN, TEACHER, 
HOMEROOM_TEACHER 
PUT /api/timetable/:id Update timetable 
entry SCHOOL_ADMIN 
DELETE /api/timetable/:id Delete timetable 
entry SCHOOL_ADMIN 
 
             TIMETABLE VIEWING 
Method Endpoint 
Description Access 
GET 
GET 
GET 
GET 
GET 
GET 
/api/timetable/view/class/:classId 
/api/timetable/view/teacher/:teacherId 
/api/timetable/view/student/my-timetable 
View class 
t
imetable 
View 
teacher 
schedule 
View own 
class 
t
imetable 
/api/timetable/view/parent/child/:studentId View child's 
t
imetable 
/api/timetable/view/parent/all-children 
/api/timetable/view/day/:classId/:dayOfWeek 
View all 
children's 
t
imetables 
View day
specific 
t
imetable 
STUDENT, PARENT, 
TEACHER, 
SCHOOL_ADMIN 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
STUDENT 
PARENT 
PARENT 
All authenticated 
AI CHAT (AI TUTOR) 
Method Endpoint 
POST /api/ai/chat 
GET 
GET 
GET 
/api/ai/chat/history 
/api/ai/chat/stats 
Description 
Ask AI tutor a 
question 
Get chat history 
Access 
STUDENT, TEACHER, 
HOMEROOM_TEACHER 
STUDENT, TEACHER, 
HOMEROOM_TEACHER 
Get chat statistics STUDENT, TEACHER, 
HOMEROOM_TEACHER 
/api/ai/chat/session/:sessionId Get session history STUDENT, TEACHER, 
HOMEROOM_TEACHER 
Method Endpoint 
Description 
Access 
GET 
/api/ai/chat/:id 
DELETE /api/ai/chat/:id 
Get specific 
conversation 
STUDENT, TEACHER, 
HOMEROOM_TEACHER 
STUDENT, TEACHER, 
HOMEROOM_TEACHER 
Delete chat 
AI HOMEWORK GENERATOR 
Method Endpoint 
POST /api/ai/homework/generate 
GET 
GET 
GET 
PUT 
/api/ai/homework 
/api/ai/homework/stats 
/api/ai/homework/:id 
/api/ai/homework/:id 
PATCH /api/ai/homework/:id/publish 
DELETE /api/ai/homework/:id 
Description 
Generate 
homework with AI 
Get teacher's 
homework 
Get homework 
statistics 
Get specific 
homework 
Access 
TEACHER, 
HOMEROOM_TEACHER 
TEACHER, 
HOMEROOM_TEACHER 
TEACHER, 
HOMEROOM_TEACHER 
TEACHER, 
HOMEROOM_TEACHER 
Update homework TEACHER, 
HOMEROOM_TEACHER 
Publish homework TEACHER, 
HOMEROOM_TEACHER 
Delete homework TEACHER, 
HOMEROOM_TEACHER 
POST /api/ai/homework/:id/regenerate Regenerate specific 
questions 
GET 
/api/ai/homework/class/:classId Get published 
homework for class 
TEACHER, 
HOMEROOM_TEACHER 
TEACHER, 
HOMEROOM_TEACHER, 
STUDENT 
AI ANALYTICS 
Method Endpoint 
GET 
GET 
GET 
GET 
GET 
GET 
/api/ai/analytics/student
performance/:studentId 
/api/ai/analytics/attendance
trends/:studentId 
/api/ai/analytics/at-risk
students/:classId 
/api/ai/analytics/class
performance/:classId 
/api/ai/analytics/performance
trends/:studentId 
Description 
Analyze student 
performance 
Analyze 
attendance 
trends 
Identify at-risk 
students 
Compare class 
performance 
Get performance 
trends over time 
/api/ai/analytics/school-overview Get school-wide 
analytics 
Access 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN, PARENT 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN 
TEACHER, 
HOMEROOM_TEACHER, 
SCHOOL_ADMIN, STUDENT, 
PARENT 
SCHOOL_ADMIN 
QUERY PARAMETERS REFERENCE 
Common Query Parameters 
javascript 
// Pagination 
?page=1&limit=50 
// Date Filters 
?startDate=2025-03-01&endDate=2025-03-31 
// Academic Year 
?academicYear=2025/2026 
// Filtering 
?classId=1&subjectId=2&teacherId=3&status=PRESENT 
// Search 
?q=mathematics 
// Admin View 
?adminView=true 
// Day of Week 
?dayOfWeek=MONDAY 
// Date 
?date=2025-03-11 
// Subject 
?subject=Mathematics 
// Difficulty 
?difficulty=MEDIUM 
// Published Status 
?isPublished=true 
// Session ID 
?sessionId=session_123456 
// Language 
?language=English 
AUTHENTICATION HEADERS 
All authenticated endpoints require: 
javascript 
headers: { 
'Authorization': 'Bearer YOUR_JWT_TOKEN', 
'Content-Type': 'application/json' 
} 
COMPLETE ENDPOINT COUNT 
Category 
Authentication 
School Management 
User Management 
Endpoint Count 
3 
6 
4 
Teacher Management 7 
Class Management 
5 
Student Management 5 
Category 
Endpoint Count 
Parent Management 
7 
Subject Management 7 
Grade System 
Student Attendance 
Teacher Attendance 
Announcements 
Messaging 
14 
6 
7 
7 
8 
Timetable Management 7 
Timetable Viewing 
AI Chat 
AI Homework 
AI Analytics 
TOTAL 
6 
6 
9 
6 
120+ Endpoints 
ENDPOINT ORGANIZATION BY USER ROLE 
SUPER_ADMIN (6 endpoints) 
• All school management endpoints 
• Create/manage school admins 
SCHOOL_ADMIN (45+ endpoints) 
• Teacher management 
• Class management 
• Subject management 
• Teacher attendance 
• Announcements 
• Timetable management 
• AI analytics (school overview) 
HOMEROOM_TEACHER (50+ endpoints) 
• Student management (own class) 
• Parent management 
• Grasde system 
• Student attendance 
• Messaging 
• Timetable viewing 
• AI chat 
• AI homework 
• AI analytics 
TEACHER (45+ endpoints) 
• Grade system 
• Student attendance 
• Messaging 
• Timetable viewing 
• AI chat 
• AI homework 
• AI analytics (limited) 
STUDENT (20+ endpoints) 
• Own grades 
• Own attendance 
• Timetable viewing 
• Messaging 
• Announcements 
• AI chat 
• Class homework (view only) 
PARENT (25+ endpoints) 
• Children's grades 
• Children's attendance 
• Children's timetable 
• Messaging 
• Announcements 
• AI analytics (children only) 