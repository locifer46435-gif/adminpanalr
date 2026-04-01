import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  Share2, 
  Menu, 
  X, 
  Plus, 
  Trash2, 
  Edit2, 
  ExternalLink, 
  Copy, 
  ChevronRight,
  Search,
  Filter,
  ArrowUpDown,
  Wallet,
  Smartphone,
  FileText,
  Link as LinkIcon,
  Bell,
  MoreVertical,
  Eye,
  EyeOff,
  LogOut,
  LogIn,
  BarChart3,
  Download,
  Check,
  ChevronDown,
  Flag,
  Sun,
  Moon,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppData, Task, Category, Device, Account, Note, Link, Report, TaskIssue, Activity } from './types';
import { auth, db, signIn, logOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  getDocFromServer,
  addDoc
} from 'firebase/firestore';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---
const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0, y: 50, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 50, scale: 0.9 }}
    className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4 border ${
      type === 'success' ? 'bg-forest-900 border-forest-800 text-white' : 'bg-rose-500 border-rose-400 text-white'
    }`}
  >
    {type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
    <span className="font-bold text-lg">{message}</span>
    <button onClick={onClose} className="ml-4 hover:opacity-70 transition-opacity">
      <X size={20} />
    </button>
  </motion.div>
);

export default function UserApp() {
  const [activeTab, setActiveTab] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [appError, setAppError] = useState<Error | null>(null);

  if (appError) throw appError;

  const isAdmin = !!user;
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [confirmingTaskModal, setConfirmingTaskModal] = useState<Task | null>(null);
  const [data, setData] = useState<AppData>({
    tasks: [],
    categories: [],
    accounts: [],
    devices: [],
    notes: [],
    links: [],
    reports: [],
    issues: [],
    activities: []
  });
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [confirmingTasks, setConfirmingTasks] = useState<Set<string>>(new Set());

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || data.devices.length === 0) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        if (userData.selectedDeviceId) {
          const device = data.devices.find(d => d.id === userData.selectedDeviceId);
          if (device) {
            setSelectedDevice(device);
          }
        }
      }
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      } catch (e) {
        setAppError(e as Error);
      }
    });

    return () => unsubscribe();
  }, [user, data.devices]);

  useEffect(() => {
    if (!user) {
      setIsDataLoading(false);
      return;
    }

    setIsDataLoading(true);
    const collections: (keyof AppData)[] = ['tasks', 'categories', 'accounts', 'devices', 'notes', 'links', 'reports', 'issues', 'activities'];
    const loadedCollections = new Set<string>();
    
    const unsubscribes = collections.map(colName => {
      let q = query(collection(db, colName));
      
      // Filter private data for non-admins
      if (['reports', 'issues', 'accounts', 'notes', 'links'].includes(colName) && !isAdmin) {
        q = query(collection(db, colName), where('uid', '==', user.uid));
      }
      
      return onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setData(prev => ({ ...prev, [colName]: docs }));
        loadedCollections.add(colName);
        if (loadedCollections.size === collections.length) {
          setIsDataLoading(false);
        }
      }, (error) => {
        setIsDataLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, colName);
        } catch (e) {
          setAppError(e as Error);
        }
      });
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user]);

  const handleConfirmTask = (task: Task) => {
    if (!selectedDevice) {
      showToast('অনুগ্রহ করে আগে একটি ডিভাইস নির্বাচন করুন', 'error');
      return;
    }

    if (isTaskCompleted(task.id) || confirmingTasks.has(task.id)) {
      showToast('এই কাজটি ইতিমধ্যে সম্পন্ন হয়েছে', 'error');
      return;
    }

    setConfirmingTaskModal(task);
  };

  const performConfirmTask = async () => {
    if (!confirmingTaskModal || !selectedDevice) return;
    const task = confirmingTaskModal;
    setConfirmingTaskModal(null);

    setConfirmingTasks(prev => new Set(prev).add(task.id));

    try {
      const reportRef = doc(collection(db, 'reports'));
      const report: Report = {
        id: reportRef.id,
        taskId: task.id,
        taskName: task.name,
        income: task.income,
        deviceId: selectedDevice.id,
        deviceName: selectedDevice.name,
        timestamp: new Date().toISOString(),
        uid: user?.uid || ''
      };

      await setDoc(reportRef, report);
      showToast('কাজটি সফলভাবে নিশ্চিত করা হয়েছে');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reports');
      showToast('কিছু ভুল হয়েছে', 'error');
    } finally {
      setConfirmingTasks(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const [reportingTask, setReportingTask] = useState<Task | null>(null);
  const [reportReason, setReportReason] = useState('');

  const handleReportIssue = async () => {
    if (!reportingTask) return;

    try {
      const issueRef = doc(collection(db, 'issues'));
      const issue: TaskIssue = {
        id: issueRef.id,
        taskId: reportingTask.id,
        taskName: reportingTask.name,
        message: reportReason || 'User reported an issue with this task.',
        timestamp: new Date().toISOString(),
        status: 'pending',
        uid: user?.uid || ''
      };

      await setDoc(issueRef, issue);
      showToast('রিপোর্ট সফলভাবে পাঠানো হয়েছে');
      setReportingTask(null);
      setReportReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'issues');
      showToast('কিছু ভুল হয়েছে', 'error');
    }
  };

  const isTaskCompleted = (taskId: string) => {
    if (!selectedDevice) return false;
    if (confirmingTasks.has(taskId)) return true;
    // Check if there's a report for this task and device today
    const today = new Date().toDateString();
    return data.reports.some(r => 
      r.taskId === taskId && 
      r.deviceId === selectedDevice.id && 
      new Date(r.timestamp).toDateString() === today
    );
  };

  const isTaskReported = (taskId: string) => {
    return data.issues.some(i => i.taskId === taskId);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} কপি করা হয়েছে`);
  };

  if (!isAuthReady || isDataLoading) {
    return (
      <div className="min-h-screen bg-sage-50 dark:bg-dark-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-sage-200 dark:border-dark-border border-t-forest-900 dark:border-t-dark-accent rounded-full animate-spin"></div>
          <p className="text-forest-900 dark:text-dark-text font-black text-xl tracking-widest animate-pulse uppercase">লোড হচ্ছে...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView showToast={showToast} />;
  }

  if (!selectedDevice) {
    return (
      <DeviceSelectionView 
        devices={data.devices} 
        onSelect={async (d) => {
          try {
            if (user) {
              await setDoc(doc(db, 'users', user.uid), { 
                uid: user.uid,
                selectedDeviceId: d.id 
              }, { merge: true });
            }
            setSelectedDevice(d);
            localStorage.setItem('selectedDevice', JSON.stringify(d));
            showToast(`${d.name} নির্বাচন করা হয়েছে`);
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, 'users');
            showToast('ডিভাইস সেভ করতে সমস্যা হয়েছে', 'error');
          }
        }} 
      />
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView data={data} selectedDevice={selectedDevice} />;
      case 'home':
        return (
          <HomeView 
            tasks={data.tasks} 
            categories={data.categories}
            onConfirm={handleConfirmTask}
            onReport={setReportingTask}
            isTaskCompleted={isTaskCompleted}
            isTaskReported={isTaskReported}
            copyToClipboard={copyToClipboard}
          />
        );
      case 'analytics':
        return <AnalyticsView reports={data.reports} selectedDevice={selectedDevice} accounts={data.accounts} user={user} />;
      case 'accounts':
        return <AccountsView accounts={data.accounts} devices={data.devices} selectedDevice={selectedDevice} copyToClipboard={copyToClipboard} />;
      case 'media':
        return <MediaView notes={data.notes} links={data.links} copyToClipboard={copyToClipboard} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-sage-50 dark:bg-dark-bg transition-colors duration-300">
      {/* Mobile Header */}
      <header className="lg:hidden bg-white dark:bg-dark-card border-b border-sage-100 dark:border-dark-border px-6 py-4 sticky top-0 z-40 flex justify-between items-center">
        <div className="flex flex-col">
          <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest">স্বাগতম</p>
          <h1 className="text-lg font-black text-forest-900 dark:text-dark-text truncate max-w-[150px]">
            {user?.displayName || 'মোহাম্মদ আল আমিন মীর'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-10 h-10 rounded-xl bg-sage-50 dark:bg-dark-border text-forest-900 dark:text-dark-accent flex items-center justify-center"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => setIsSidebarOpen(true)} className="w-10 h-10 bg-sage-50 dark:bg-dark-border rounded-xl flex items-center justify-center text-forest-900 dark:text-dark-text">
            <Menu size={20} />
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <AnimatePresence>
          {(isSidebarOpen || window.innerWidth >= 1024) && (
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className={`fixed lg:sticky top-0 h-screen w-80 bg-white dark:bg-dark-card border-r border-sage-100 dark:border-dark-border z-50 flex flex-col p-8 ${isSidebarOpen ? 'block' : 'hidden lg:flex'}`}
            >
              <div className="flex justify-between items-center mb-12">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-forest-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-forest-900/20">
                    <LayoutDashboard size={24} />
                  </div>
                  <h1 className="text-2xl font-black text-forest-900 dark:text-dark-text tracking-tight">ড্যাশবোর্ড</h1>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-sage-400">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                <nav className="space-y-3 mb-8">
                  <SidebarLink icon={LayoutDashboard} label="ড্যাশবোর্ড" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} />
                  <SidebarLink icon={Briefcase} label="কাজসমূহ" active={activeTab === 'home'} onClick={() => { setActiveTab('home'); setIsSidebarOpen(false); }} />
                  <SidebarLink icon={BarChart3} label="অ্যানালাইসিস" active={activeTab === 'analytics'} onClick={() => { setActiveTab('analytics'); setIsSidebarOpen(false); }} />
                  <SidebarLink icon={Users} label="অ্যাকাউন্ট" active={activeTab === 'accounts'} onClick={() => { setActiveTab('accounts'); setIsSidebarOpen(false); }} />
                  <SidebarLink icon={Share2} label="মিডিয়া শেয়ার" active={activeTab === 'media'} onClick={() => { setActiveTab('media'); setIsSidebarOpen(false); }} />
                </nav>

                <div className="mt-auto space-y-4">
                  <div className="p-6 bg-sage-50 dark:bg-dark-border rounded-[2rem] flex items-center gap-4">
                    <div className="w-12 h-12 bg-white dark:bg-dark-card rounded-xl flex items-center justify-center text-forest-900 dark:text-dark-accent shadow-sm">
                      <Smartphone size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest">ডিভাইস</p>
                      <p className="text-sm font-black text-forest-900 dark:text-dark-text truncate">{selectedDevice?.name}</p>
                    </div>
                  </div>

                  <div className="hidden lg:flex items-center justify-between p-2 bg-sage-50 dark:bg-dark-border rounded-2xl">
                    <button 
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className="flex-1 py-2 rounded-xl flex items-center justify-center gap-2 text-xs font-black transition-all bg-white dark:bg-dark-card text-forest-900 dark:text-dark-accent shadow-sm"
                    >
                      {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                      {isDarkMode ? 'লাইট মোড' : 'ডার্ক মোড'}
                    </button>
                  </div>

                  <button 
                    onClick={() => logOut()}
                    className="w-full flex items-center gap-4 p-6 text-sage-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-[2rem] transition-all font-bold"
                  >
                    <LogOut size={24} />
                    <span>লগ আউট</span>
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-12 overflow-x-hidden">
          <div className="max-w-7xl mx-auto space-y-12">
            <header className="hidden lg:flex justify-between items-center">
              <div>
                <p className="text-sm font-black text-sage-400 uppercase tracking-widest">স্বাগতম</p>
                <h2 className="text-4xl font-black text-forest-900 dark:text-dark-text tracking-tight">
                  {user?.displayName || 'মোহাম্মদ আল আমিন মীর'}
                </h2>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs font-black text-sage-400 uppercase tracking-widest">আজকের আয়</p>
                  <p className="text-2xl font-black text-emerald-500">
                    ${data.reports
                      .filter(r => r.deviceId === selectedDevice?.id && new Date(r.timestamp).toDateString() === new Date().toDateString())
                      .reduce((sum, r) => sum + r.income, 0)
                      .toFixed(2)}
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-forest-900 flex items-center justify-center text-white font-black text-xl shadow-xl shadow-forest-900/10 overflow-hidden">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    user?.displayName?.charAt(0) || 'A'
                  )}
                </div>
              </div>
            </header>
            {renderContent()}
          </div>
        </main>
      </div>

      <AnimatePresence>
        {confirmingTaskModal && (
          <Modal 
            isOpen={!!confirmingTaskModal} 
            onClose={() => setConfirmingTaskModal(null)} 
            title="কাজ নিশ্চিত করুন"
          >
            <div className="space-y-8">
              <div className="p-8 bg-emerald-50 dark:bg-emerald-500/10 rounded-[2.5rem] border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-6">
                <div className="w-16 h-16 bg-white dark:bg-dark-card rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm">
                  <CheckCircle2 size={32} />
                </div>
                <div className="flex-1">
                  <h4 className="text-xl font-black text-emerald-900 dark:text-emerald-400">আপনি কি নিশ্চিত?</h4>
                  <p className="text-emerald-700/70 dark:text-emerald-400/70 font-bold leading-tight mt-1">
                    "{confirmingTaskModal.name}" টাস্কটি সম্পন্ন হয়েছে বলে নিশ্চিত করতে চান?
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmingTaskModal(null)}
                  className="flex-1 h-16 bg-sage-50 dark:bg-dark-border text-sage-400 rounded-2xl font-black hover:bg-sage-100 transition-all"
                >
                  বাতিল
                </button>
                <button 
                  onClick={performConfirmTask}
                  className="flex-[2] h-16 bg-emerald-500 text-white rounded-2xl font-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all flex items-center justify-center gap-3"
                >
                  <Check size={20} />
                  হ্যাঁ, নিশ্চিত করুন
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reportingTask && (
          <Modal 
            isOpen={!!reportingTask} 
            onClose={() => {
              setReportingTask(null);
              setReportReason('');
            }} 
            title="রিপোর্ট নিশ্চিত করুন"
          >
            <div className="space-y-8">
              <div className="p-8 bg-rose-50 dark:bg-rose-500/10 rounded-[2.5rem] border border-rose-100 dark:border-rose-500/20 flex items-center gap-6">
                <div className="w-16 h-16 bg-white dark:bg-dark-card rounded-2xl flex items-center justify-center text-rose-500 shadow-sm">
                  <AlertCircle size={32} />
                </div>
                <div className="flex-1">
                  <h4 className="text-xl font-black text-rose-900 dark:text-rose-400">আপনি কি নিশ্চিত?</h4>
                  <p className="text-rose-700/70 dark:text-rose-400/70 font-bold leading-tight mt-1">
                    "{reportingTask.name}" টাস্কটি সম্পর্কে রিপোর্ট করতে চান?
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-black text-sage-400 dark:text-dark-text/50 uppercase tracking-widest ml-4">রিপোর্ট করার কারণ (অপশনাল)</label>
                <textarea 
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="কেন রিপোর্ট করছেন তা এখানে লিখুন..."
                  className="w-full min-h-[120px] p-6 bg-sage-50 dark:bg-dark-border border border-sage-100 dark:border-dark-border rounded-[2rem] text-forest-900 dark:text-dark-text font-bold focus:outline-none focus:ring-4 focus:ring-forest-900/5 dark:focus:ring-dark-accent/10 transition-all resize-none"
                />
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setReportingTask(null);
                    setReportReason('');
                  }}
                  className="flex-1 h-16 bg-sage-50 dark:bg-dark-border text-sage-400 rounded-2xl font-black hover:bg-sage-100 transition-all"
                >
                  বাতিল
                </button>
                <button 
                  onClick={handleReportIssue}
                  className="flex-[2] h-16 bg-rose-500 text-white rounded-2xl font-black shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition-all flex items-center justify-center gap-3"
                >
                  <Flag size={20} />
                  হ্যাঁ, রিপোর্ট করুন
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-forest-900/40 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-lg bg-white dark:bg-dark-card rounded-[3.5rem] shadow-2xl overflow-hidden border border-sage-100 dark:border-dark-border"
      >
        <div className="px-10 py-8 border-b border-sage-100 dark:border-dark-border flex justify-between items-center bg-sage-50/50 dark:bg-dark-bg/50">
          <h3 className="text-2xl font-black text-forest-900 dark:text-dark-text tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-3 bg-white dark:bg-dark-border rounded-2xl text-sage-400 hover:text-forest-900 dark:hover:text-dark-text transition-colors shadow-sm">
            <X size={24} />
          </button>
        </div>
        <div className="p-10 max-h-[70vh] overflow-y-auto no-scrollbar">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function SidebarLink({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-6 rounded-[2rem] transition-all duration-300 group ${
        active 
          ? 'bg-forest-900 text-white shadow-xl shadow-forest-900/20' 
          : 'text-sage-400 hover:bg-sage-50 dark:hover:bg-dark-border hover:text-forest-900 dark:hover:text-dark-text'
      }`}
    >
      <Icon size={24} className={active ? 'text-white' : 'group-hover:scale-110 transition-transform'} />
      <span className="font-bold text-lg">{label}</span>
      {active && <motion.div layoutId="active-pill" className="ml-auto w-2 h-2 bg-white rounded-full" />}
    </button>
  );
}

function LoginView({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('লগইন সফল হয়েছে');
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast('অ্যাকাউন্ট তৈরি সফল হয়েছে');
      }
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        showToast('এই ইমেইলটি ইতিমধ্যে ব্যবহৃত হচ্ছে', 'error');
      } else if (error.code === 'auth/weak-password') {
        showToast('পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে', 'error');
      } else {
        showToast(isLogin ? 'ইমেইল বা পাসওয়ার্ড ভুল' : 'অ্যাকাউন্ট তৈরি করতে সমস্যা হয়েছে', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sage-50 dark:bg-dark-bg flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white dark:bg-dark-card p-10 rounded-[3.5rem] border border-sage-100 dark:border-dark-border shadow-2xl space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-forest-900 rounded-[2rem] flex items-center justify-center text-white mx-auto shadow-xl shadow-forest-900/20">
            <LayoutDashboard size={40} />
          </div>
          <h1 className="text-3xl font-black text-forest-900 dark:text-dark-text">
            {isLogin ? 'ইউজার লগইন' : 'অ্যাকাউন্ট তৈরি করুন'}
          </h1>
          <p className="text-sage-400 font-bold">
            {isLogin ? 'আপনার অ্যাকাউন্টে প্রবেশ করুন' : 'নতুন অ্যাকাউন্ট তৈরি করতে তথ্য দিন'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-black text-sage-400 uppercase tracking-widest ml-4">ইমেইল</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field" 
              placeholder="example@mail.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-sage-400 uppercase tracking-widest ml-4">পাসওয়ার্ড</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field" 
              placeholder="••••••••"
            />
          </div>
          <button 
            disabled={isLoading}
            className="btn-primary w-full h-16 text-xl"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              isLogin ? 'লগইন করুন' : 'সাইন আপ করুন'
            )}
          </button>
        </form>

        <div className="text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-forest-900 dark:text-dark-accent font-bold hover:underline"
          >
            {isLogin ? 'নতুন অ্যাকাউন্ট তৈরি করতে চান? সাইন আপ করুন' : 'ইতিমধ্যে অ্যাকাউন্ট আছে? লগইন করুন'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DeviceSelectionView({ devices, onSelect }: { devices: Device[], onSelect: (d: Device) => void }) {
  return (
    <div className="min-h-screen bg-sage-50 dark:bg-dark-bg flex items-center justify-center p-6">
      <div className="w-full max-w-4xl space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-black text-forest-900 dark:text-dark-text tracking-tight">ডিভাইস নির্বাচন করুন</h1>
          <p className="text-xl text-sage-400 font-bold">কাজ শুরু করার জন্য একটি ডিভাইস সিলেক্ট করুন</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {devices.map((device, i) => (
            <motion.button
              key={device.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => onSelect(device)}
              className="bg-white dark:bg-dark-card p-10 rounded-[3rem] border border-sage-100 dark:border-dark-border shadow-sm hover:shadow-2xl hover:shadow-forest-900/10 hover:-translate-y-2 transition-all group text-center"
            >
              <div className="w-20 h-20 bg-sage-50 dark:bg-dark-border rounded-[2rem] flex items-center justify-center text-forest-900 dark:text-dark-accent mx-auto mb-6 group-hover:bg-forest-900 group-hover:text-white transition-colors">
                <Smartphone size={40} />
              </div>
              <h3 className="text-2xl font-black text-forest-900 dark:text-dark-text">{device.name}</h3>
              <p className="text-sage-400 font-bold mt-2">আইডি: {device.id.slice(0, 8)}</p>
            </motion.button>
          ))}
        </div>

        <div className="flex justify-center pt-12">
          <button 
            onClick={() => logOut()}
            className="flex items-center gap-4 px-12 py-6 bg-white dark:bg-dark-card border border-sage-100 dark:border-dark-border rounded-[3rem] text-sage-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all font-black uppercase tracking-widest shadow-sm"
          >
            <LogOut size={24} />
            <span>লগ আউট</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ data, selectedDevice }: { data: AppData, selectedDevice: Device | null }) {
  const today = new Date().toDateString();
  const todayReports = data.reports.filter(r => 
    r.deviceId === selectedDevice?.id && 
    new Date(r.timestamp).toDateString() === today
  );
  const todayIncome = todayReports.reduce((sum, r) => sum + r.income, 0);

  const recentActivities = [...data.activities]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'task': return <Briefcase size={18} />;
      case 'account': return <Users size={18} />;
      case 'note': return <FileText size={18} />;
      case 'link': return <LinkIcon size={18} />;
      case 'category': return <Filter size={18} />;
      case 'device': return <Smartphone size={18} />;
      default: return <BarChart3 size={18} />;
    }
  };

  const getActionColor = (action: Activity['action']) => {
    switch (action) {
      case 'create': return 'text-emerald-500 bg-emerald-500/10';
      case 'update': return 'text-blue-500 bg-blue-500/10';
      case 'delete': return 'text-rose-500 bg-rose-500/10';
      default: return 'text-sage-400 bg-sage-400/10';
    }
  };

  const getActionText = (action: Activity['action']) => {
    switch (action) {
      case 'create': return 'যুক্ত করেছেন';
      case 'update': return 'আপডেট করেছেন';
      case 'delete': return 'মুছে ফেলেছেন';
      default: return '';
    }
  };

  const getTypeText = (type: Activity['type']) => {
    switch (type) {
      case 'task': return 'টাস্ক';
      case 'account': return 'অ্যাকাউন্ট';
      case 'note': return 'নোট';
      case 'link': return 'লিংক';
      case 'category': return 'ক্যাটাগরি';
      case 'device': return 'ডিভাইস';
      default: return '';
    }
  };

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="card bg-forest-900 text-white p-8 space-y-4">
          <div className="flex items-center gap-4 opacity-80">
            <Wallet size={24} />
            <span className="font-black uppercase tracking-widest text-sm">আজকের আয়</span>
          </div>
          <h3 className="text-5xl font-black tracking-tight">${todayIncome.toFixed(2)}</h3>
        </div>
        <div className="card bg-white dark:bg-dark-card p-8 space-y-4 border border-sage-100 dark:border-dark-border">
          <div className="flex items-center gap-4 text-sage-400">
            <CheckCircle2 size={24} />
            <span className="font-black uppercase tracking-widest text-sm">আজকের কাজ</span>
          </div>
          <h3 className="text-5xl font-black text-forest-900 dark:text-dark-text tracking-tight">{todayReports.length}</h3>
        </div>
        <div className="card bg-white dark:bg-dark-card p-8 space-y-4 border border-sage-100 dark:border-dark-border">
          <div className="flex items-center gap-4 text-sage-400">
            <Users size={24} />
            <span className="font-black uppercase tracking-widest text-sm">সক্রিয় অ্যাকাউন্ট</span>
          </div>
          <h3 className="text-5xl font-black text-forest-900 dark:text-dark-text tracking-tight">
            {data.accounts.filter(a => a.deviceId === selectedDevice?.id).length}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-forest-900 dark:text-dark-text tracking-tight">সাম্প্রতিক কার্যকলাপ</h3>
            <BarChart3 className="text-sage-300" size={24} />
          </div>
          <div className="space-y-4">
            {recentActivities.length > 0 ? (
              recentActivities.map((activity, i) => (
                <motion.div 
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-6 bg-white dark:bg-dark-card rounded-[2rem] border border-sage-100 dark:border-dark-border flex items-center gap-6 group hover:shadow-xl hover:shadow-forest-900/5 transition-all"
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${getActionColor(activity.action)}`}>
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black uppercase tracking-widest text-sage-400">অ্যাডমিন</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${getActionColor(activity.action)}`}>
                        {activity.action}
                      </span>
                    </div>
                    <p className="text-forest-900 dark:text-dark-text font-bold truncate">
                      একটি নতুন <span className="text-forest-900 dark:text-dark-accent">{getTypeText(activity.type)}</span> {getActionText(activity.action)}: <span className="italic">"{activity.name}"</span>
                    </p>
                    <p className="text-xs text-sage-400 font-bold mt-1">
                      {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(activity.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="p-12 text-center bg-sage-50 dark:bg-dark-bg rounded-[3rem] border-2 border-dashed border-sage-200 dark:border-dark-border">
                <p className="text-sage-400 font-bold">এখনো কোনো কার্যকলাপ নেই</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-forest-900 dark:text-dark-text tracking-tight">নতুন টাস্কসমূহ</h3>
            <Briefcase className="text-sage-300" size={24} />
          </div>
          <div className="grid grid-cols-1 gap-4">
            {data.tasks
              .filter(t => data.categories.some(c => c.id === t.categoryId))
              .slice(0, 4)
              .map((task, i) => (
              <div key={task.id} className="p-6 bg-white dark:bg-dark-card rounded-[2rem] border border-sage-100 dark:border-dark-border flex items-center justify-between group">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 bg-sage-50 dark:bg-dark-border rounded-2xl flex items-center justify-center text-forest-900 dark:text-dark-accent group-hover:bg-forest-900 group-hover:text-white transition-all">
                    <Briefcase size={24} />
                  </div>
                  <div>
                    <h4 className="font-black text-forest-900 dark:text-dark-text">{task.name}</h4>
                    <div className="mt-1">
                      <span className="px-2 py-0.5 bg-sage-50 dark:bg-dark-border rounded-md text-[9px] font-black text-forest-900 dark:text-dark-accent uppercase tracking-widest border border-sage-100 dark:border-dark-border">
                        {data.categories.find(c => c.id === task.categoryId)?.name || 'অজানা'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-forest-900 dark:text-dark-accent">${task.income.toFixed(2)}</p>
                  <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest">আয়</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeView({ tasks, categories, onConfirm, onReport, isTaskCompleted, isTaskReported, copyToClipboard }: { 
  tasks: Task[], 
  categories: Category[], 
  onConfirm: (t: Task) => void, 
  onReport: (t: Task) => void,
  isTaskCompleted: (id: string) => boolean,
  isTaskReported: (id: string) => boolean,
  copyToClipboard: (t: string, l: string) => void
}) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'new' | 'old' | 'price'>('new');

  const filteredTasks = useMemo(() => {
    let result = tasks.filter(t => {
      const categoryExists = categories.some(c => c.id === t.categoryId);
      if (!categoryExists) return false;

      return t.name.toLowerCase().includes(search.toLowerCase()) &&
             (selectedCategory === 'all' || t.categoryId === selectedCategory);
    });

    if (sortBy === 'new') {
      // Get latest task timestamp per category to determine category priority
      const categoryLatestTaskTime: Record<string, string> = {};
      tasks.forEach(t => {
        if (!categoryLatestTaskTime[t.categoryId] || t.createdAt > categoryLatestTaskTime[t.categoryId]) {
          categoryLatestTaskTime[t.categoryId] = t.createdAt;
        }
      });

      result.sort((a, b) => {
        const catTimeA = categoryLatestTaskTime[a.categoryId] || '';
        const catTimeB = categoryLatestTaskTime[b.categoryId] || '';
        
        // Sort by category's latest task time first (descending)
        if (catTimeA !== catTimeB) {
          return catTimeB.localeCompare(catTimeA);
        }
        
        // If in same category, sort by task's own time (descending)
        return b.createdAt.localeCompare(a.createdAt);
      });
    }
    if (sortBy === 'old') result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (sortBy === 'price') result.sort((a, b) => b.income - a.income);

    return result;
  }, [tasks, search, selectedCategory, sortBy]);

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
        <div>
          <h2 className="text-4xl font-black text-forest-900 dark:text-dark-text tracking-tight">কাজসমূহ</h2>
          <p className="text-sage-400 font-bold text-lg mt-2">আপনার জন্য বরাদ্দকৃত কাজগুলো সম্পন্ন করুন</p>
        </div>
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-sage-300" size={20} />
            <input 
              type="text" 
              placeholder="কাজ খুঁজুন..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-16"
            />
          </div>
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="input-field md:w-48 appearance-none cursor-pointer"
          >
            <option value="all">সব ক্যাটাগরি</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="input-field md:w-48 appearance-none cursor-pointer"
          >
            <option value="new">নতুন আগে</option>
            <option value="old">পুরাতন আগে</option>
            <option value="price">বেশি দাম আগে</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-8">
        {filteredTasks.map((task, i) => {
          const completed = isTaskCompleted(task.id);
          const reported = isTaskReported(task.id);
          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                scale: completed ? 0.98 : 1,
                filter: completed ? 'grayscale(0.5)' : 'grayscale(0)'
              }}
              transition={{ 
                delay: i * 0.05,
                scale: { duration: 0.3 },
                filter: { duration: 0.3 }
              }}
              className={`card group relative overflow-hidden flex flex-col transition-shadow duration-300 ${completed ? 'shadow-none border-sage-50 dark:border-dark-border/50' : 'hover:shadow-xl hover:shadow-forest-900/5'}`}
            >
              {completed && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute top-4 right-4 z-10 text-emerald-500"
                >
                  <CheckCircle2 size={24} />
                </motion.div>
              )}
              <div className="flex-1 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 bg-sage-50 dark:bg-dark-border rounded-2xl flex items-center justify-center text-forest-900 dark:text-dark-accent group-hover:bg-forest-900 group-hover:text-white transition-colors">
                    <Briefcase size={24} />
                  </div>
                  <span className="text-xl font-black text-forest-900 dark:text-dark-accent">${task.income.toFixed(2)}</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-forest-900 dark:text-dark-text line-clamp-2 leading-tight">{task.name}</h3>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="px-2 py-1 bg-sage-50 dark:bg-dark-border rounded-lg text-[10px] font-black text-forest-900 dark:text-dark-accent uppercase tracking-widest border border-sage-100 dark:border-dark-border">
                      {categories.find(c => c.id === task.categoryId)?.name || 'অজানা'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <div className="flex gap-2">
                  <button 
                    onClick={() => window.open(task.link, '_blank')}
                    className="flex-1 h-12 bg-forest-900 dark:bg-dark-accent text-white dark:text-dark-bg rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                  >
                    <ExternalLink size={16} />
                    লিংক
                  </button>
                  <button 
                    onClick={() => copyToClipboard(task.link, 'লিংক')}
                    className="w-12 h-12 bg-sage-50 dark:bg-dark-border text-forest-900 dark:text-dark-text rounded-xl flex items-center justify-center hover:bg-sage-100 transition-colors"
                  >
                    <Copy size={18} />
                  </button>
                </div>
                
                <AnimatePresence mode="wait">
                  {!completed ? (
                    <motion.button 
                      key="confirm"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => onConfirm(task)}
                      className="w-full h-12 bg-emerald-500 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all"
                    >
                      <Check size={18} />
                      কনফার্ম করুন
                    </motion.button>
                  ) : (
                    <motion.button 
                      key="completed"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      disabled
                      className="w-full h-12 bg-sage-100 dark:bg-dark-border text-sage-400 rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-not-allowed"
                    >
                      <CheckCircle2 size={18} />
                      সম্পন্ন
                    </motion.button>
                  )}
                </AnimatePresence>

                <button 
                  disabled={reported}
                  onClick={() => onReport(task)}
                  className="w-full text-[10px] font-black text-sage-400 uppercase tracking-widest hover:text-rose-500 transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Flag size={12} />
                  {reported ? 'রিপোর্ট করা হয়েছে' : 'রিপোর্ট করুন'}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function AnalyticsView({ reports, selectedDevice, accounts, user }: { reports: Report[], selectedDevice: Device, accounts: Account[], user: User | null }) {
  const [filter, setFilter] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const filteredReports = useMemo(() => {
    const now = new Date();
    return reports.filter(r => {
      if (r.deviceId !== selectedDevice.id) return false;
      const date = new Date(r.timestamp);
      if (filter === 'daily') return date.toDateString() === now.toDateString();
      if (filter === 'weekly') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return date >= weekAgo;
      }
      if (filter === 'monthly') {
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [reports, selectedDevice, filter]);

  const stats = useMemo(() => {
    const totalIncome = filteredReports.reduce((sum, r) => sum + r.income, 0);
    const totalTasks = filteredReports.length;
    
    // Account-wise stats
    const accountStats = accounts
      .filter(acc => acc.deviceId === selectedDevice.id)
      .map(acc => {
        const accReports = filteredReports.filter(r => r.accountId === acc.id);
        return {
          id: acc.id,
          name: acc.name || 'N/A',
          email: acc.email,
          tasks: accReports.length,
          income: accReports.reduce((sum, r) => sum + r.income, 0)
        };
      });

    return { totalIncome, totalTasks, accountStats };
  }, [filteredReports, accounts, selectedDevice]);

  const downloadPDF = async () => {
    const invoiceElement = document.getElementById('invoice-template');
    if (!invoiceElement) return;

    // Temporarily show the template for capturing
    invoiceElement.style.display = 'block';
    
    try {
      const canvas = await html2canvas(invoiceElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF('p', 'mm', 'a4');
      const imgProps = (doc as any).getImageProperties(imgData);
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      doc.save(`invoice-${selectedDevice.name}-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('PDF Generation Error:', error);
    } finally {
      invoiceElement.style.display = 'none';
    }
  };

  return (
    <div className="space-y-12">
      {/* Hidden Invoice Template for PDF Generation */}
      <div id="invoice-template" style={{ display: 'none', width: '800px', padding: '40px', background: 'white', color: 'black', fontFamily: "'Hind Siliguri', sans-serif" }}>
        <div style={{ borderBottom: '2px solid #14532d', paddingBottom: '20px', marginBottom: '30px' }}>
          <h1 style={{ color: '#14532d', fontSize: '32px', fontWeight: '900', margin: '0 0 10px 0' }}>আয় রিপোর্ট (ইনভয়েস)</h1>
          <div style={{ color: '#666', fontSize: '14px', lineHeight: '1.6' }}>
            <p>ইউজার: {user?.displayName || 'মোহাম্মদ আল আমিন মীর'}</p>
            <p>ডিভাইস: {selectedDevice.name}</p>
            <p>তারিখ: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
            <p>ফিল্টার: {filter === 'daily' ? 'দৈনিক' : filter === 'weekly' ? 'সাপ্তাহিক' : 'মাসিক'}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '40px' }}>
          <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '12px', border: '1px solid #dcfce7' }}>
            <p style={{ color: '#166534', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', margin: '0 0 5px 0' }}>মোট কাজ</p>
            <h2 style={{ color: '#14532d', fontSize: '28px', fontWeight: '900', margin: '0' }}>{stats.totalTasks}</h2>
          </div>
          <div style={{ background: '#14532d', padding: '20px', borderRadius: '12px', color: 'white' }}>
            <p style={{ opacity: '0.8', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', margin: '0 0 5px 0' }}>মোট আয়</p>
            <h2 style={{ fontSize: '28px', fontWeight: '900', margin: '0' }}>${stats.totalIncome.toFixed(2)}</h2>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
          <thead>
            <tr style={{ background: '#14532d', color: 'white', textAlign: 'left' }}>
              <th style={{ padding: '12px', border: '1px solid #14532d' }}>নাম</th>
              <th style={{ padding: '12px', border: '1px solid #14532d' }}>ইমেইল</th>
              <th style={{ padding: '12px', border: '1px solid #14532d', textAlign: 'center' }}>কাজ</th>
              <th style={{ padding: '12px', border: '1px solid #14532d', textAlign: 'right' }}>আয়</th>
            </tr>
          </thead>
          <tbody>
            {stats.accountStats.map((s, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>{s.name}</td>
                <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>{s.email}</td>
                <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{s.tasks}</td>
                <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'right' }}>${s.income.toFixed(2)}</td>
              </tr>
            ))}
            <tr style={{ background: '#f3f4f6', fontWeight: 'bold' }}>
              <td colSpan={2} style={{ padding: '12px', border: '1px solid #e5e7eb' }}>সর্বমোট</td>
              <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{stats.totalTasks}</td>
              <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'right' }}>${stats.totalIncome.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ color: '#999', fontSize: '12px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
          এই রিপোর্টটি স্বয়ংক্রিয়ভাবে জেনারেট করা হয়েছে।
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-4xl font-black text-forest-900 dark:text-dark-text tracking-tight">অ্যানালাইসিস</h2>
          <p className="text-sage-400 font-bold text-lg mt-2">{selectedDevice.name} এর আয়ের হিসাব</p>
        </div>
        <button onClick={downloadPDF} className="btn-primary flex items-center gap-2">
          <Download size={20} /> PDF ডাউনলোড
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="card bg-forest-900 text-white p-10 space-y-4">
          <div className="flex items-center gap-4 opacity-80">
            <Wallet size={24} />
            <span className="font-black uppercase tracking-widest text-sm">মোট আয়</span>
          </div>
          <h3 className="text-6xl font-black tracking-tight">${stats.totalIncome.toFixed(2)}</h3>
        </div>
        <div className="card bg-white dark:bg-dark-card p-10 space-y-4 border border-sage-100 dark:border-dark-border">
          <div className="flex items-center gap-4 text-sage-400">
            <CheckCircle2 size={24} />
            <span className="font-black uppercase tracking-widest text-sm">সম্পন্ন কাজ</span>
          </div>
          <h3 className="text-6xl font-black text-forest-900 dark:text-dark-text tracking-tight">{stats.totalTasks}</h3>
        </div>
      </div>

      <div className="bg-white dark:bg-dark-card p-10 rounded-[3.5rem] border border-sage-100 dark:border-dark-border shadow-sm space-y-8">
        <div className="flex gap-2 border-b border-sage-100 dark:border-dark-border pb-6 overflow-x-auto no-scrollbar">
          <button onClick={() => setFilter('daily')} className={`px-8 py-4 rounded-2xl text-sm font-black whitespace-nowrap transition-all ${filter === 'daily' ? 'bg-forest-900 text-white' : 'bg-sage-50 dark:bg-dark-border text-sage-400 hover:bg-sage-100'}`}>দৈনিক (আজ)</button>
          <button onClick={() => setFilter('weekly')} className={`px-8 py-4 rounded-2xl text-sm font-black whitespace-nowrap transition-all ${filter === 'weekly' ? 'bg-forest-900 text-white' : 'bg-sage-50 dark:bg-dark-border text-sage-400 hover:bg-sage-100'}`}>সাপ্তাহিক</button>
          <button onClick={() => setFilter('monthly')} className={`px-8 py-4 rounded-2xl text-sm font-black whitespace-nowrap transition-all ${filter === 'monthly' ? 'bg-forest-900 text-white' : 'bg-sage-50 dark:bg-dark-border text-sage-400 hover:bg-sage-100'}`}>মাসিক</button>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-sage-100 dark:border-dark-border">
                <th className="py-6 px-4 text-xs font-black text-sage-400 uppercase tracking-widest">অ্যাকাউন্ট</th>
                <th className="py-6 px-4 text-xs font-black text-sage-400 uppercase tracking-widest text-center">কাজ</th>
                <th className="py-6 px-4 text-xs font-black text-sage-400 uppercase tracking-widest text-right">আয়</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-50 dark:divide-dark-border">
              {stats.accountStats.map((s, i) => (
                <tr key={i} className="group hover:bg-sage-50/50 dark:hover:bg-dark-bg/50 transition-colors">
                  <td className="py-6 px-4">
                    <div className="font-black text-forest-900 dark:text-dark-text">{s.name}</div>
                    <div className="text-xs text-sage-400 font-bold">{s.email}</div>
                  </td>
                  <td className="py-6 px-4 text-center font-black text-forest-900 dark:text-dark-text">{s.tasks}</td>
                  <td className="py-6 px-4 text-right font-black text-emerald-500">${s.income.toFixed(2)}</td>
                </tr>
              ))}
              {stats.accountStats.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-sage-400 font-bold">কোনো ডাটা পাওয়া যায়নি</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AccountsView({ accounts, devices, selectedDevice, copyToClipboard }: { accounts: Account[], devices: Device[], selectedDevice: Device | null, copyToClipboard: (t: string, l: string) => void }) {
  const [search, setSearch] = useState('');

  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const deviceExists = devices.some(d => d.id === acc.deviceId);
      if (!deviceExists) return false;

      // Filter by globally selected device
      if (selectedDevice && acc.deviceId !== selectedDevice.id) return false;

      const matchesSearch = (acc.name && acc.name.toLowerCase().includes(search.toLowerCase())) || 
                           acc.email.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [accounts, search, devices, selectedDevice]);

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
        <div>
          <h2 className="text-4xl font-black text-forest-900 dark:text-dark-text tracking-tight">অ্যাকাউন্টসমূহ</h2>
          <p className="text-sage-400 font-bold text-lg mt-2">
            {selectedDevice ? `"${selectedDevice.name}" ডিভাইসের অ্যাকাউন্টগুলো এখানে পাবেন` : 'আপনার কাজের জন্য প্রয়োজনীয় অ্যাকাউন্টগুলো এখানে পাবেন'}
          </p>
        </div>
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-sage-300" size={20} />
            <input 
              type="text" 
              placeholder="অ্যাকাউন্ট খুঁজুন..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-16"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredAccounts.map((acc, i) => {
          const device = devices.find(d => d.id === acc.deviceId);
          return (
            <motion.div
              key={acc.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="card space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-sage-50 dark:bg-dark-border rounded-2xl flex items-center justify-center text-forest-900 dark:text-dark-accent">
                    <Users size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-forest-900 dark:text-dark-text">{acc.name}</h3>
                    <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest">{acc.email}</p>
                  </div>
                </div>
                {device && (
                  <div className="px-3 py-1 bg-forest-900/5 dark:bg-dark-accent/10 rounded-full flex items-center gap-2 border border-forest-900/10 dark:border-dark-accent/20">
                    <Smartphone size={12} className="text-forest-900 dark:text-dark-accent" />
                    <span className="text-[10px] font-black text-forest-900 dark:text-dark-accent uppercase tracking-widest">
                      {device.name}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-sage-50 dark:bg-dark-border rounded-2xl flex items-center justify-between group">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest">ইমেইল</p>
                    <p className="text-sm font-bold text-forest-900 dark:text-dark-text truncate">{acc.email}</p>
                  </div>
                  <button onClick={() => copyToClipboard(acc.email, 'ইমেইল')} className="text-sage-400 hover:text-forest-900 dark:hover:text-dark-accent transition-colors">
                    <Copy size={18} />
                  </button>
                </div>
                <div className="p-4 bg-sage-50 dark:bg-dark-border rounded-2xl flex items-center justify-between group">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest">পাসওয়ার্ড</p>
                    <p className="text-sm font-bold text-forest-900 dark:text-dark-text truncate">••••••••</p>
                  </div>
                  <button onClick={() => copyToClipboard(acc.password, 'পাসওয়ার্ড')} className="text-sage-400 hover:text-forest-900 dark:hover:text-dark-accent transition-colors">
                    <Copy size={18} />
                  </button>
                </div>

                {acc.notes && (
                  <div className="p-4 bg-sage-50/50 dark:bg-dark-border/50 rounded-2xl border border-dashed border-sage-200 dark:border-dark-border">
                    <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest mb-1">নোটস</p>
                    <p className="text-xs font-medium text-sage-600 dark:text-dark-text/70 leading-relaxed">{acc.notes}</p>
                  </div>
                )}
              </div>

              {acc.link && (
                <button 
                  onClick={() => window.open(acc.link, '_blank')}
                  className="w-full h-14 bg-forest-900 dark:bg-dark-accent text-white dark:text-dark-bg rounded-2xl font-black flex items-center justify-center gap-3 hover:opacity-90 transition-all"
                >
                  <ExternalLink size={20} />
                  সাইটে যান
                </button>
              )}
            </motion.div>
          );
        })}
        {filteredAccounts.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <div className="w-20 h-20 bg-sage-50 dark:bg-dark-border rounded-full flex items-center justify-center text-sage-300 mx-auto mb-6">
              <Users size={40} />
            </div>
            <h3 className="text-2xl font-black text-forest-900 dark:text-dark-text">কোনো অ্যাকাউন্ট পাওয়া যায়নি</h3>
            <p className="text-sage-400 font-bold mt-2">আপনার সার্চ বা ফিল্টার পরিবর্তন করে দেখুন</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaView({ notes, links, copyToClipboard }: { notes: Note[], links: Link[], copyToClipboard: (t: string, l: string) => void }) {
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-4xl font-black text-forest-900 dark:text-dark-text tracking-tight">মিডিয়া শেয়ার</h2>
        <p className="text-sage-400 font-bold text-lg mt-2">প্রয়োজনীয় নোট এবং লিংকগুলো এখানে পাবেন</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Notes Section */}
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-forest-900 rounded-xl flex items-center justify-center text-white">
              <FileText size={20} />
            </div>
            <h3 className="text-2xl font-black text-forest-900 dark:text-dark-text">নোটসমূহ</h3>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {notes.map((note, i) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white dark:bg-dark-card p-6 rounded-[2rem] border border-sage-100 dark:border-dark-border flex items-center justify-between group hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-sage-50 dark:bg-dark-border rounded-xl flex items-center justify-center text-forest-900 dark:text-dark-accent">
                    <FileText size={24} />
                  </div>
                  <span className="font-bold text-lg text-forest-900 dark:text-dark-text">{note.name}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copyToClipboard(note.content, 'নোট')} className="w-10 h-10 text-sage-400 hover:text-forest-900 dark:hover:text-dark-accent transition-colors">
                    <Copy size={20} />
                  </button>
                  <button onClick={() => setSelectedNote(note)} className="w-10 h-10 text-sage-400 hover:text-forest-900 dark:hover:text-dark-accent transition-colors">
                    <Eye size={20} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Links Section */}
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-forest-900 rounded-xl flex items-center justify-center text-white">
              <LinkIcon size={20} />
            </div>
            <h3 className="text-2xl font-black text-forest-900 dark:text-dark-text">লিংকসমূহ</h3>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {links.map((link, i) => (
              <motion.div
                key={link.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white dark:bg-dark-card p-6 rounded-[2rem] border border-sage-100 dark:border-dark-border flex items-center justify-between group hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-sage-50 dark:bg-dark-border rounded-xl flex items-center justify-center text-forest-900 dark:text-dark-accent">
                    <LinkIcon size={24} />
                  </div>
                  <span className="font-bold text-lg text-forest-900 dark:text-dark-text">{link.name}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copyToClipboard(link.url, 'লিংক')} className="w-10 h-10 text-sage-400 hover:text-forest-900 dark:hover:text-dark-accent transition-colors">
                    <Copy size={20} />
                  </button>
                  <button onClick={() => window.open(link.url, '_blank')} className="w-10 h-10 text-sage-400 hover:text-forest-900 dark:hover:text-dark-accent transition-colors">
                    <ExternalLink size={20} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Note Modal */}
      <AnimatePresence>
        {selectedNote && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedNote(null)}
              className="absolute inset-0 bg-forest-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-dark-card rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 border-b border-sage-100 dark:border-dark-border flex justify-between items-center">
                <h3 className="text-2xl font-black text-forest-900 dark:text-dark-text">{selectedNote.name}</h3>
                <button onClick={() => setSelectedNote(null)} className="text-sage-400 hover:text-forest-900 dark:hover:text-dark-accent transition-colors">
                  <X size={28} />
                </button>
              </div>
              <div className="p-8 overflow-y-auto flex-1 text-lg text-forest-800 dark:text-dark-text whitespace-pre-wrap font-medium leading-relaxed">
                {selectedNote.content}
              </div>
              <div className="p-8 border-t border-sage-100 dark:border-dark-border flex justify-end">
                <button 
                  onClick={() => copyToClipboard(selectedNote.content, 'নোট')}
                  className="btn-primary"
                >
                  <Copy size={20} />
                  কপি করুন
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
