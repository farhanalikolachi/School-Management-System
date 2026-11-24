import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard, Users, UserCheck, BookOpen, Layers, Calendar, ClipboardCheck,
  Wallet, Award, FileText, Bell, BarChart3, Settings, UserCircle, LogOut,
  Sun, Moon, Menu, X, ChevronDown, FileSpreadsheet, Bot,
} from 'lucide-react';
import { apiRequest, setCsrfToken, clearAuthTokens } from './lib/api';
import { ToastProvider, ImageWithFallback, useToast } from './components/UiPrimitives';
import { LoginScreen, MandatoryPasswordChangeScreen, type LoggedInUser } from './components/LoginScreen';
import { AiAgentPanel } from './components/AiAgentView';
import { DashboardView } from './views/DashboardView';
import { StudentsView } from './views/StudentsView';
import { TeachersView } from './views/TeachersView';
import { CredentialsView } from './views/CredentialsView';
import { ClassesView, CoursesView, TimetableView } from './views/AcademicsView';
import { FeesView } from './views/FeesView';
import { AttendanceView } from './views/AttendanceView';
import { ExamsView, AssignmentsView } from './views/ExamsAssignmentsView';
import { NoticesView, ReportsView, SettingsAndAdminOpsView, ProfileAndLeaveView } from './views/OperationsView';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'teachers', label: 'Teachers & Payroll', icon: UserCheck },
  { id: 'credentials', label: 'Credentials Sheet', icon: FileSpreadsheet },
  { id: 'classes', label: 'Academy Classes', icon: Layers },
  { id: 'courses', label: 'Courses', icon: BookOpen },
  { id: 'fees', label: 'Fees & Payments', icon: Wallet },
  { id: 'timetable', label: 'Timetable', icon: Calendar },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { id: 'exams', label: 'Exams & Results', icon: Award },
  { id: 'assignments', label: 'Assignments', icon: FileText },
  { id: 'notices', label: 'Notices', icon: Bell },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'ai-agent', label: 'AI Agent', icon: Bot },
  { id: 'settings', label: 'Settings & Backups', icon: Settings },
  { id: 'profile', label: 'My Profile', icon: UserCircle },
];

const TEACHER_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Assigned Students', icon: Users },
  { id: 'attendance', label: 'Mark Attendance', icon: ClipboardCheck },
  { id: 'assignments', label: 'Assignments', icon: FileText },
  { id: 'exams', label: 'Exams & Marks', icon: Award },
  { id: 'timetable', label: 'My Timetable', icon: Calendar },
  { id: 'notices', label: 'Notices', icon: Bell },
  { id: 'ai-agent', label: 'AI Agent', icon: Bot },
  { id: 'profile', label: 'Profile & Leave', icon: UserCircle },
];

const STUDENT_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'attendance', label: 'My Attendance', icon: ClipboardCheck },
  { id: 'fees', label: 'Fees & Receipts', icon: Wallet },
  { id: 'timetable', label: 'Timetable', icon: Calendar },
  { id: 'assignments', label: 'Assignments', icon: FileText },
  { id: 'exams', label: 'Exams & Results', icon: Award },
  { id: 'courses', label: 'Courses Catalog', icon: BookOpen },
  { id: 'notices', label: 'Notices', icon: Bell },
  { id: 'ai-agent', label: 'AI Agent', icon: Bot },
  { id: 'profile', label: 'Profile & Leave', icon: UserCircle },
];

function AppShell() {
  const { clearToasts } = useToast();
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sti_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('sti_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiRequest('/api/notifications');
      setNotifications(res.items || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // ignore if unauthenticated
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const res = await apiRequest<{ authenticated?: boolean; user: LoggedInUser | null; profile?: any; csrfToken?: string }>('/api/auth/me');
      if (res.authenticated && res.user) {
        setCsrfToken(res.csrfToken || '');
        setUser(res.user);
        setProfile(res.profile || null);
        loadNotifications();
      } else {
        clearAuthTokens();
        setUser(null);
        setProfile(null);
      }
    } catch {
      clearAuthTokens();
      setUser(null);
      setProfile(null);
    } finally {
      setBooting(false);
    }
  }, [loadNotifications]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearAuthTokens();
    clearToasts();
    setUser(null);
    setProfile(null);
    setActiveTab('dashboard');
    setProfileMenuOpen(false);
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading SindhTech Institute Portal...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onAuthenticated={(loggedUser) => {
          setUser(loggedUser);
          setActiveTab('dashboard');
          refreshMe();
        }}
      />
    );
  }

  if (user.mustChangePassword) {
    return (
      <MandatoryPasswordChangeScreen
        user={user}
        onCompleted={() => refreshMe()}
        onLogout={handleLogout}
      />
    );
  }

  const navItems = user.role === 'admin' ? ADMIN_NAV : user.role === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  const currentNav = navItems.find((n) => n.id === activeTab) || navItems[0];

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0F2942] text-slate-100 border-r border-slate-800/80 no-print">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/10 shrink-0">
          <img
            src="/src/assets/images/institute_crest_1794654889307.jpg"
            alt="SindhTech Institute Logo"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover bg-white p-0.5 shrink-0 shadow-xs"
          />
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-white truncate">
              SindhTech Institute
            </div>
            <div className="text-[11px] text-slate-300 capitalize truncate">
              {user.role} Portal
            </div>
          </div>
        </div>

        <nav aria-label="Primary Sidebar" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-white/15 text-white shadow-xs'
                    : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2">
          <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <div className="text-xs font-semibold text-white truncate">{user.fullName}</div>
            <div className="text-[11px] text-slate-300 font-mono-tabular truncate">{user.username}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0F2942] text-white flex flex-col h-full z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
              <span className="font-display font-bold text-base">SindhTech Institute</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                      active ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Quick AI Agent Button */}
            <button
              type="button"
              onClick={() => {
                setAiDrawerOpen(true);
                setNotifOpen(false);
                setProfileMenuOpen(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <Bot className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Agent</span>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                aria-label="Toggle notifications"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setProfileMenuOpen(false);
                }}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold">Notifications</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest('/api/notifications/read-all', { method: 'POST' });
                        loadNotifications();
                      }}
                      className="text-xs text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500 text-center">No notifications.</div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={`p-3.5 text-xs ${n.is_read ? 'opacity-70' : 'bg-blue-50/40 dark:bg-blue-950/20'}`}>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</div>
                          <div className="text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ImageWithFallback
                  src={user.avatarUrl}
                  alt={user.fullName}
                  fallbackText={user.fullName}
                  className="w-7 h-7 rounded-md object-cover text-xs"
                />
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight max-w-[140px] truncate">
                    {user.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 capitalize leading-tight">
                    {user.role}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-40 py-1.5 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('profile');
                      setProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <UserCircle className="w-4 h-4" /> My Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && <DashboardView role={user.role} onNavigate={setActiveTab} />}
          {activeTab === 'students' && user.role !== 'student' && <StudentsView role={user.role} />}
          {activeTab === 'teachers' && user.role === 'admin' && <TeachersView />}
          {activeTab === 'credentials' && user.role === 'admin' && <CredentialsView />}
          {activeTab === 'classes' && user.role !== 'student' && <ClassesView role={user.role} />}
          {activeTab === 'courses' && <CoursesView role={user.role} />}
          {activeTab === 'fees' && user.role !== 'teacher' && <FeesView role={user.role} />}
          {activeTab === 'timetable' && <TimetableView role={user.role} />}
          {activeTab === 'attendance' && <AttendanceView role={user.role} />}
          {activeTab === 'exams' && <ExamsView role={user.role} currentUserName={user.fullName} />}
          {activeTab === 'assignments' && <AssignmentsView role={user.role} />}
          {activeTab === 'notices' && <NoticesView role={user.role} />}
          {activeTab === 'reports' && user.role === 'admin' && <ReportsView />}
          {activeTab === 'ai-agent' && <AiAgentPanel role={user.role} userName={user.fullName} />}
          {activeTab === 'settings' && user.role === 'admin' && <SettingsAndAdminOpsView />}
          {activeTab === 'profile' && <ProfileAndLeaveView user={user} profile={profile} onUpdated={refreshMe} />}
        </main>
      </div>

      {/* Quick AI Agent Slide-Over Drawer */}
      {aiDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end no-print">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setAiDrawerOpen(false)} />
          <div className="relative z-10 w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800">
            <AiAgentPanel
              compact
              role={user.role}
              userName={user.fullName}
              onClose={() => setAiDrawerOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
