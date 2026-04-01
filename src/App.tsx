import React, { useState, useEffect, useMemo } from 'react';
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
  List
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppData, Task, Category, Device, Account, Note, Link, Report, TaskIssue, Activity } from './types';
import { auth, db, signIn, logOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from './firebase';
import { onAuthStateChanged, User, updateProfile } from 'firebase/auth';
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
  addDoc,
  getDocs
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import UserApp from './UserApp';

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

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "কিছু ভুল হয়েছে। অনুগ্রহ করে পেজটি রিফ্রেশ করুন।";
      try {
        const parsedError = JSON.parse(this.state.error?.message || "{}");
        if (parsedError.error === "Missing or insufficient permissions.") {
          errorMessage = "আপনার এই তথ্য দেখার অনুমতি নেই। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-sage-50 flex items-center justify-center p-6">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-w-lg w-full text-center space-y-6 border border-rose-100">
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <X size={40} />
            </div>
            <h2 className="text-2xl font-black text-forest-900">দুঃখিত!</h2>
            <p className="text-sage-500 font-medium">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-forest-900 text-white font-black py-4 rounded-2xl transition-all active:scale-95"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-forest-900/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl border border-sage-100"
          >
            <div className="p-8 border-b border-sage-50 flex justify-between items-center bg-sage-50/30">
              <div>
                <h3 className="text-2xl font-black text-forest-900 tracking-tight leading-none">{title}</h3>
                <div className="w-10 h-1 bg-forest-900 rounded-full mt-3"></div>
              </div>
              <button onClick={onClose} className="p-3 hover:bg-sage-100 text-forest-900 rounded-2xl transition-all active:scale-90">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 max-h-[80vh] overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 50, x: '-50%' }}
      className={`fixed bottom-8 left-1/2 z-[110] px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 border ${
        type === 'success' ? 'bg-forest-900 border-forest-800 text-white' : 'bg-rose-600 border-rose-500 text-white'
      }`}
    >
      <span className="font-bold text-lg">{message}</span>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userDevice, setUserDevice] = useState<string | null>(null);
  const [isUserDeviceLoading, setIsUserDeviceLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [appError, setAppError] = useState<Error | null>(null);

  if (appError) throw appError;
  
  // Auth States
  const [isSignUp, setIsSignUp] = useState(false);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  // Global Modal States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [isCatListModalOpen, setIsCatListModalOpen] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isAccModalOpen, setIsAccModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingLink, setEditingLink] = useState<Link | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{ type: keyof AppData, id: string } | null>(null);

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

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isAdmin = !!user;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    if (!user) {
      setUserDevice(null);
      setIsUserDeviceLoading(false);
      return;
    }

    setIsUserDeviceLoading(true);

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setUserDevice(docSnap.data().deviceId || null);
      } else {
        setUserDevice(null);
      }
      setIsUserDeviceLoading(false);
    }, (error) => {
      setIsUserDeviceLoading(false);
      try {
        handleFirestoreError(error, OperationType.GET, 'users');
      } catch (e) {
        setAppError(e as Error);
      }
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  useEffect(() => {
    if (!user || !isAuthReady) {
      setIsDataLoading(false);
      return;
    }

    setIsDataLoading(true);
    const collections: (keyof AppData)[] = ['tasks', 'categories', 'accounts', 'devices', 'notes', 'links', 'reports', 'issues', 'activities'];
    const loadedCollections = new Set<string>();
    
    const unsubscribes = collections.map(colName => {
      const q = query(collection(db, colName));

      return onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
        setData(prev => ({ ...prev, [colName]: items }));
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
  }, [user, isAuthReady]);

  const logActivity = async (type: Activity['type'], action: Activity['action'], name: string) => {
    if (!user) return;
    try {
      const activityRef = doc(collection(db, 'activities'));
      const activity: Activity = {
        id: activityRef.id,
        type,
        action,
        name,
        timestamp: new Date().toISOString(),
        uid: user.uid
      };
      await setDoc(activityRef, activity);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const updateFirestore = async (type: keyof AppData, item: any, isDelete = false) => {
    if (!user) return;
    const path = `${type}/${item.id}`;
    try {
      if (isDelete) {
        await deleteDoc(doc(db, type, item.id));
        if (['tasks', 'accounts', 'notes', 'links', 'categories', 'devices'].includes(type)) {
          logActivity(type as any, 'delete', item.name || item.siteName || item.email || item.id);
        }
      } else {
        const isUpdate = (data[type] as any[]).some((i: any) => i.id === item.id);
        await setDoc(doc(db, type, item.id), { ...item, uid: item.uid || user.uid });
        if (['tasks', 'accounts', 'notes', 'links', 'categories', 'devices'].includes(type)) {
          logActivity(type as any, isUpdate ? 'update' : 'create', item.name || item.siteName || item.email || item.id);
        }
      }
    } catch (error) {
      handleFirestoreError(error, isDelete ? OperationType.DELETE : OperationType.WRITE, path);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const handleGoogleAuth = async () => {
    setAuthError('');
    setIsAuthLoading(true);
    try {
      await signIn();
    } catch (error: any) {
      let errorMessage = 'Google লগইন ব্যর্থ হয়েছে';
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'লগইন উইন্ডোটি বন্ধ করা হয়েছে।';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'লগইন রিকোয়েস্ট বাতিল করা হয়েছে।';
      } else if (error.message) {
        errorMessage = error.message;
      }
      setAuthError(errorMessage);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        if (authName) {
          await updateProfile(userCredential.user, { displayName: authName });
          setUser({ ...userCredential.user, displayName: authName });
        }
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (error: any) {
      let errorMessage = 'অথেনটিকেশন ব্যর্থ হয়েছে';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'এই ইমেইলটি ইতিমধ্যে ব্যবহার করা হয়েছে। আপনি কি লগইন করতে চান?';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'ইমেইলটি সঠিক নয়।';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'পাসওয়ার্ডটি অন্তত ৬ অক্ষরের হতে হবে।';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'এই ইমেইল দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি।';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'ভুল পাসওয়ার্ড।';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'অনেকবার ভুল চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setAuthError(errorMessage);
    } finally {
      setIsAuthLoading(false);
    }
  };

  // --- Handlers ---
  const addCategory = (name: string) => {
    if (!name || !user) return;
    const newCat = { id: Date.now().toString(), name, uid: user.uid };
    updateFirestore('categories', newCat);
    showToast('ক্যাটাগরি যুক্ত করা হয়েছে');
  };

  const addTask = (task: Omit<Task, 'id' | 'createdAt' | 'uid'>) => {
    if (!user) return;
    const newTask = { ...task, id: Date.now().toString(), createdAt: new Date().toISOString(), uid: user.uid };
    updateFirestore('tasks', newTask);
    showToast('টাস্ক যুক্ত করা হয়েছে');
  };

  const addDevice = (name: string) => {
    if (!name || !user) return;
    const newDevice = { id: Date.now().toString(), name, uid: user.uid };
    updateFirestore('devices', newDevice);
    showToast('ডিভাইস যুক্ত করা হয়েছে');
  };

  const addAccount = (account: Omit<Account, 'id' | 'uid'>) => {
    if (!user) return;
    const newAccount = { ...account, id: Date.now().toString(), uid: user.uid };
    updateFirestore('accounts', newAccount);
    showToast('অ্যাকাউন্ট যুক্ত করা হয়েছে');
  };

  const addNote = (name: string, content: string) => {
    if (!user) return;
    const newNote = { id: Date.now().toString(), name, content, uid: user.uid };
    updateFirestore('notes', newNote);
    showToast('নোট যুক্ত করা হয়েছে');
  };

  const addLink = (name: string, url: string) => {
    if (!user) return;
    const newLink = { id: Date.now().toString(), name, url, uid: user.uid };
    updateFirestore('links', newLink);
    showToast('লিংক যুক্ত করা হয়েছে');
  };

  const editTask = (updatedTask: Task) => {
    updateFirestore('tasks', updatedTask);
    showToast('টাস্ক আপডেট করা হয়েছে');
  };

  const editAccount = (updatedAccount: Account) => {
    updateFirestore('accounts', updatedAccount);
    showToast('অ্যাকাউন্ট আপডেট করা হয়েছে');
  };

  const editNote = (updatedNote: Note) => {
    updateFirestore('notes', updatedNote);
    showToast('নোট আপডেট করা হয়েছে');
  };

  const deleteItem = (type: keyof AppData, id: string) => {
    updateFirestore(type, { id }, true);
    showToast('সফলভাবে মুছে ফেলা হয়েছে', 'error');
    setConfirmDelete(null);
  };

  const ConfirmModal = () => (
    <Modal 
      isOpen={!!confirmDelete} 
      onClose={() => setConfirmDelete(null)} 
      title="আপনি কি নিশ্চিত?"
    >
      <div className="space-y-6 text-center">
        <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={40} />
        </div>
        <p className="text-sage-500 font-medium text-lg">
          এটি মুছে ফেললে আর ফিরে পাওয়া যাবে না। আপনি কি নিশ্চিতভাবে এটি মুছতে চান?
        </p>
        <div className="flex gap-4 pt-4">
          <button 
            onClick={() => setConfirmDelete(null)} 
            className="btn-secondary flex-1 py-4"
          >
            না, থাক
          </button>
          <button 
            onClick={() => confirmDelete && deleteItem(confirmDelete.type, confirmDelete.id)} 
            className="bg-rose-500 hover:bg-rose-600 text-white font-black py-4 px-8 rounded-[1.5rem] flex-1 transition-all active:scale-95"
          >
            হ্যাঁ, মুছে দিন
          </button>
        </div>
      </div>
    </Modal>
  );

  const NotificationsModal = () => {
    const pendingIssues = data.issues.filter(i => i.status === 'pending');
    
    const resolveIssue = (issue: TaskIssue) => {
      updateFirestore('issues', { ...issue, status: 'resolved' });
      showToast('সমস্যাটি সমাধান করা হয়েছে');
    };

    const handleEditTaskFromIssue = (taskId: string) => {
      const task = data.tasks.find(t => t.id === taskId);
      if (task) {
        setEditingTask(task);
        setIsNotificationsModalOpen(false);
      } else {
        showToast('টাস্কটি খুঁজে পাওয়া যায়নি', 'error');
      }
    };

    const handleDeleteTaskFromIssue = (taskId: string, issueId: string) => {
      const task = data.tasks.find(t => t.id === taskId);
      if (task) {
        setConfirmDelete({ type: 'tasks', id: taskId });
        // We don't resolve the issue here, let the user do it after deletion or automatically?
        // Let's just close the notifications modal to show the confirm delete modal
        setIsNotificationsModalOpen(false);
      } else {
        showToast('টাস্কটি ইতিমধ্যে মুছে ফেলা হয়েছে', 'error');
        // If task is gone, maybe resolve the issue?
        updateFirestore('issues', { id: issueId, status: 'resolved' } as any);
      }
    };

    return (
      <Modal isOpen={isNotificationsModalOpen} onClose={() => setIsNotificationsModalOpen(false)} title="নোটিফিকেশন">
        <div className="space-y-4">
          {pendingIssues.length === 0 ? (
            <div className="text-center py-8 text-sage-400 font-bold">
              কোনো নতুন নোটিফিকেশন নেই
            </div>
          ) : (
            pendingIssues.map(issue => (
              <div key={issue.id} className="bg-sage-50 p-6 rounded-[2rem] border border-sage-100 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-forest-900 text-lg">{issue.taskName}</h4>
                    <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest mt-1">
                      {issue.timestamp && !isNaN(new Date(issue.timestamp).getTime()) 
                        ? new Date(issue.timestamp).toLocaleString() 
                        : 'N/A'}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-rose-100 text-rose-600 text-[10px] font-black rounded-full uppercase tracking-widest">রিপোর্ট</span>
                </div>
                
                <div className="p-4 bg-white rounded-2xl border border-sage-100">
                  <p className="text-sm text-sage-500 font-medium leading-relaxed italic">"{issue.message}"</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleEditTaskFromIssue(issue.taskId)}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-black text-forest-900 bg-white border border-sage-100 rounded-xl hover:bg-sage-50 transition-all"
                  >
                    <Edit2 size={14} /> সংশোধন করুন
                  </button>
                  <button 
                    onClick={() => handleDeleteTaskFromIssue(issue.taskId, issue.id)}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-black text-rose-500 bg-rose-50 rounded-xl hover:bg-rose-100 transition-all"
                  >
                    <Trash2 size={14} /> টাস্ক মুছুন
                  </button>
                </div>

                <div className="flex gap-2 pt-2 border-t border-sage-100">
                  <button 
                    onClick={() => deleteItem('issues', issue.id)}
                    className="flex-1 py-3 text-xs font-bold text-sage-400 hover:text-rose-500 transition-colors"
                  >
                    ইস্যু মুছুন
                  </button>
                  <button 
                    onClick={() => resolveIssue(issue)}
                    className="flex-[2] py-3 text-xs font-black text-white bg-forest-900 rounded-xl hover:bg-forest-800 transition-all shadow-lg shadow-forest-900/10"
                  >
                    সমাধান হয়েছে
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    );
  };

  // --- Sub-Pages ---

  const HomePage = () => {
    const now = new Date();
    const monthlyReports = data.reports.filter(r => {
      if (!r.timestamp) return false;
      const d = new Date(r.timestamp);
      return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthlyIncome = monthlyReports.reduce((sum, r) => sum + Number(r.income || 0), 0);
    const todayReports = data.reports.filter(r => {
      if (!r.timestamp) return false;
      const d = new Date(r.timestamp);
      return !isNaN(d.getTime()) && d.toDateString() === now.toDateString();
    });
    const todayIncome = todayReports.reduce((sum, r) => sum + Number(r.income || 0), 0);
    const todayTasks = todayReports.length;

    const stats = [
      { label: 'মাসিক মোট আয়', value: `$${monthlyIncome.toFixed(2)}`, icon: Wallet, color: 'forest' },
      { label: 'আজকের আয়', value: `$${todayIncome.toFixed(2)}`, icon: Wallet, color: 'sage' },
      { label: 'মোট কাজ সম্পন্ন', value: data.reports.length, icon: Briefcase, color: 'sage' },
      { label: 'আজকের কাজ', value: todayTasks, icon: Briefcase, color: 'forest' },
    ];

    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });

    const weeklyData = last7Days.map(date => {
      const dayReports = data.reports.filter(r => {
        if (!r.timestamp) return false;
        const d = new Date(r.timestamp);
        return !isNaN(d.getTime()) && d.toDateString() === date.toDateString();
      });
      return dayReports.reduce((sum, r) => sum + Number(r.income || 0), 0);
    });

    const maxIncome = Math.max(...weeklyData, 1);
    const weeklyHeights = weeklyData.map(income => (income / maxIncome) * 100);
    const dayNames = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
    const weeklyLabels = last7Days.map(d => dayNames[d.getDay()]);

    return (
      <div className="space-y-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <p className="text-sage-400 font-bold text-sm">স্বাগতম</p>
            <h2 className="text-3xl font-black text-forest-900 tracking-tight">মোহাম্মদ আল আমিন মীর</h2>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-12 h-12 rounded-2xl bg-sage-50 dark:bg-dark-border text-forest-900 dark:text-dark-accent flex items-center justify-center hover:bg-sage-100 transition-all"
            >
              {isDarkMode ? <Sun size={22} /> : <Moon size={22} />}
            </button>
            <button onClick={() => setIsNotificationsModalOpen(true)} className="relative w-14 h-14 bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-sage-100 dark:border-dark-border text-forest-900 dark:text-dark-text flex items-center justify-center hover:bg-sage-50 dark:hover:bg-dark-border transition-colors">
              <Bell size={22} />
              {data.issues.filter(i => i.status === 'pending').length > 0 && (
                <span className="absolute top-3 right-3 w-3 h-3 bg-rose-500 rounded-full border-2 border-white dark:border-dark-card"></span>
              )}
            </button>
            <button className="w-14 h-14 bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-sage-100 dark:border-dark-border text-forest-900 dark:text-dark-text flex items-center justify-center hover:bg-sage-50 dark:hover:bg-dark-border transition-colors">
              <MoreVertical size={22} />
            </button>
          </div>
        </div>

        <motion.div 
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setIsTaskModalOpen(true)}
          className="bg-forest-900 p-10 rounded-[3.5rem] text-white flex flex-col md:flex-row justify-between items-center gap-8 group cursor-pointer shadow-2xl shadow-forest-900/20"
        >
          <div className="flex items-center gap-8">
            <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center backdrop-blur-md">
              <Plus size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black">নতুন টাস্ক তৈরি করুন</h3>
              <p className="text-white/60 text-lg mt-1">সহজেই আপনার মাইক্রোজব টাস্কগুলো ম্যানেজ করুন</p>
            </div>
          </div>
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-forest-900 group-hover:translate-x-3 transition-transform">
            <ChevronRight size={32} />
          </div>
        </motion.div>

        <div className="space-y-8">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-2xl font-black text-forest-900">সারসংক্ষেপ</h3>
            <button className="text-sage-400 font-bold hover:text-forest-900 transition-colors">সব দেখুন</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white p-10 rounded-[3rem] border border-sage-100/50 shadow-sm flex flex-col items-center text-center hover:shadow-xl hover:shadow-sage-100/50 transition-all"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
                  stat.color === 'forest' ? 'bg-forest-900 text-white shadow-lg shadow-forest-900/20' : 'bg-sage-100 text-forest-900'
                }`}>
                  <stat.icon size={24} />
                </div>
                <p className="text-xs font-black text-sage-400 uppercase tracking-[0.2em]">{stat.label}</p>
                <h2 className="text-3xl font-black text-forest-900 mt-2">{stat.value}</h2>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="bg-white p-10 rounded-[3.5rem] border border-sage-100/50 shadow-sm space-y-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-sage-50 rounded-2xl flex items-center justify-center text-forest-900">
                <LayoutDashboard size={28} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-forest-900">সাপ্তাহিক অ্যাক্টিভিটি</h3>
                <p className="text-sage-400 font-bold text-sm">গত ৭ দিনের কাজের রিপোর্ট</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-5 py-2 rounded-full bg-sage-50 text-forest-900 text-xs font-black">সাপ্তাহিক</button>
              <button className="px-5 py-2 rounded-full text-sage-400 text-xs font-bold">মাসিক</button>
            </div>
          </div>
          
          <div className="h-64 flex items-end justify-between gap-4 px-4">
            {weeklyHeights.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-4 h-full justify-end">
                <div className="relative w-full h-full group flex items-end">
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(h, 2)}%` }}
                    className={`w-full rounded-full transition-all duration-500 ${i === 6 ? 'bg-forest-900 shadow-lg shadow-forest-900/20' : 'bg-sage-100 group-hover:bg-sage-200'}`}
                  />
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-forest-900 text-white text-[10px] font-black px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    ${weeklyData[i].toFixed(2)}
                  </div>
                </div>
                <span className="text-xs font-bold text-sage-400">
                  {weeklyLabels[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const TaskPage = () => {
    const [filterCat, setFilterCat] = useState('all');
    const [sortBy, setSortBy] = useState('newest');

    const filteredTasks = data.tasks
      .filter(t => filterCat === 'all' || t.categoryId === filterCat)
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        
        if (sortBy === 'newest') return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        if (sortBy === 'oldest') return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
        if (sortBy === 'price-high') return (b.income || 0) - (a.income || 0);
        if (sortBy === 'price-low') return (a.income || 0) - (b.income || 0);
        return 0;
      });

    return (
      <div className="space-y-8">
        <div className="flex flex-wrap gap-4">
          <button onClick={() => setIsTaskModalOpen(true)} className="btn-primary">
            <Plus size={20} /> টাস্ক যোগ করুন
          </button>
          <button onClick={() => setIsCatModalOpen(true)} className="btn-secondary">
            <Plus size={20} /> ক্যাটাগরি যোগ করুন
          </button>
          <button onClick={() => setIsCatListModalOpen(true)} className="btn-secondary">
            <List size={20} /> ক্যাটাগরি তালিকা
          </button>
        </div>

        <div className="flex flex-wrap gap-6 items-center bg-white p-5 rounded-[2.5rem] border border-sage-100/50 shadow-sm">
          <div className="flex items-center gap-4 px-4">
            <div className="w-10 h-10 bg-sage-50 rounded-xl flex items-center justify-center text-forest-900">
              <Filter size={18} />
            </div>
            <select 
              className="bg-transparent focus:outline-none text-sm font-black text-forest-900 cursor-pointer appearance-none pr-8 relative"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="all">সব ক্যাটাগরি</option>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="h-8 w-px bg-sage-100 hidden md:block"></div>
          <div className="flex items-center gap-4 px-4">
            <div className="w-10 h-10 bg-sage-50 rounded-xl flex items-center justify-center text-forest-900">
              <ArrowUpDown size={18} />
            </div>
            <select 
              className="bg-transparent focus:outline-none text-sm font-black text-forest-900 cursor-pointer appearance-none pr-8"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">নতুন আগে</option>
              <option value="oldest">পুরাতন আগে</option>
              <option value="price-high">বেশি দাম</option>
              <option value="price-low">কম দাম</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4">
          <AnimatePresence mode="popLayout">
            {filteredTasks.map(task => {
              const isReported = data.issues.some(issue => issue.taskId === task.id);
              return (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={task.id} 
                className={`p-6 rounded-[2.5rem] border shadow-sm transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                  isReported 
                    ? 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800/30' 
                    : 'bg-white border-sage-100/50'
                } hover:border-sage-200 cursor-pointer group`}
                onClick={() => {
                  setEditingTask(task);
                }}
              >
                <div className="flex items-center gap-5">
                  <div className={`w-14 h-14 rounded-[1.5rem] bg-sage-50 flex items-center justify-center text-sage-400 transition-colors group-hover:bg-forest-900 group-hover:text-white`}>
                    <Briefcase size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-xl text-forest-900">{task.name}</h4>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-[10px] font-black text-sage-400 bg-sage-50 px-3 py-1 rounded-full inline-block uppercase tracking-widest">
                        {data.categories.find(c => c.id === task.categoryId)?.name || 'Unknown'}
                      </span>
                      {isReported && (
                        <span className="text-[10px] font-black text-rose-600 bg-rose-100 px-3 py-1 rounded-full inline-flex items-center gap-1 uppercase tracking-widest">
                          <Flag size={10} /> রিপোর্ট করা হয়েছে
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                  <span className="text-2xl font-black text-forest-900">${task.income}</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'tasks', id: task.id }); }}
                      className="p-3 text-sage-200 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all active:scale-90"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
            })}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  const AccountPage = () => {
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

    const togglePassword = (id: string) => {
      setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
      <div className="space-y-8">
        <div className="flex flex-wrap gap-4">
          <button onClick={() => setIsDeviceModalOpen(true)} className="btn-primary">
            <Smartphone size={20} /> ডিভাইস যুক্ত করুন
          </button>
          <button onClick={() => setIsAccModalOpen(true)} className="btn-secondary">
            <Plus size={20} /> অ্যাকাউন্ট যুক্ত করুন
          </button>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <h3 className="text-lg font-black text-forest-900 uppercase tracking-widest px-2">ডিভাইস সমূহ</h3>
            <div className="space-y-3">
              {data.devices.map(device => (
                <div 
                  key={device.id}
                  onClick={() => setSelectedDevice(device.id)}
                  className={`w-full cursor-pointer text-left p-5 rounded-[2.5rem] border transition-all flex justify-between items-center group ${
                    selectedDevice === device.id 
                    ? 'bg-forest-900 border-forest-900 text-white shadow-lg shadow-forest-900/10' 
                    : 'bg-white border-sage-100 text-forest-900 hover:bg-sage-50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <Smartphone size={20} className={selectedDevice === device.id ? 'text-white/60' : 'text-sage-300'} />
                    <span className="font-bold text-lg">{device.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      selectedDevice === device.id ? 'bg-white/20 text-white' : 'bg-sage-100 text-sage-500'
                    }`}>
                      {data.accounts.filter(a => a.deviceId === device.id).length}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'devices', id: device.id }); }}
                      className={`p-2 rounded-2xl transition-all ${
                        selectedDevice === device.id ? 'hover:bg-white/10 text-white/40 hover:text-white' : 'hover:bg-rose-50 text-sage-200 hover:text-rose-500'
                      }`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <h3 className="text-lg font-black text-forest-900 uppercase tracking-widest px-2">অ্যাকাউন্ট লিস্ট</h3>
            {!selectedDevice ? (
              <div className="bg-white rounded-[3rem] p-20 text-center border border-sage-100/50">
                <Users size={64} className="mx-auto text-sage-100 mb-6" />
                <p className="text-sage-400 font-bold text-xl">অ্যাকাউন্ট দেখতে ডিভাইস নির্বাচন করুন</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {data.accounts
                  .filter(acc => acc.deviceId === selectedDevice)
                  .map(acc => (
                    <motion.div 
                      layout
                      key={acc.id} 
                      onClick={() => setEditingAccount(acc)}
                      className="bg-white p-8 rounded-[2.5rem] border border-sage-100/50 shadow-sm hover:border-sage-200 transition-all group relative overflow-hidden cursor-pointer"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-bold text-2xl text-forest-900">{acc.siteName}</h4>
                          <div className="mt-6 grid md:grid-cols-2 gap-4">
                            <div className="flex items-center justify-between bg-sage-50/50 px-5 py-4 rounded-3xl border border-sage-100/30">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-black text-sage-400 uppercase tracking-widest">ইমেইল</span>
                                <span className="text-sm font-bold text-forest-800 truncate max-w-[150px]">{acc.email}</span>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(acc.email); showToast('ইমেইল কপি করা হয়েছে'); }} className="p-2 text-sage-400 hover:text-forest-900 transition-colors">
                                <Copy size={16} />
                              </button>
                            </div>
                            <div className="flex items-center justify-between bg-sage-50/50 px-5 py-4 rounded-3xl border border-sage-100/30">
                              <div className="flex flex-col flex-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); togglePassword(acc.id); }}>
                                <span className="text-[9px] font-black text-sage-400 uppercase tracking-widest">পাসওয়ার্ড</span>
                                <span className="text-sm font-bold text-forest-800 tracking-widest">
                                  {showPasswords[acc.id] ? acc.password : '••••••••'}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                <button onClick={(e) => { e.stopPropagation(); togglePassword(acc.id); }} className="p-2 text-sage-400 hover:text-forest-900 transition-colors">
                                  {showPasswords[acc.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(acc.password); showToast('পাসওয়ার্ড কপি করা হয়েছে'); }} className="p-2 text-sage-400 hover:text-forest-900 transition-colors">
                                  <Copy size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                          {acc.notes && (
                            <div className="mt-4 p-4 bg-sage-50/30 rounded-2xl border border-dashed border-sage-200">
                              <span className="text-[9px] font-black text-sage-400 uppercase tracking-widest block mb-1">নোটস</span>
                              <p className="text-sm text-sage-600 font-medium leading-relaxed">{acc.notes}</p>
                            </div>
                          )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'accounts', id: acc.id }); }} className="p-3 text-sage-200 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all ml-4">
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const MediaPage = () => {
    return (
      <div className="space-y-12">
        <div className="flex flex-wrap gap-4">
          <button onClick={() => setIsNoteModalOpen(true)} className="btn-primary">
            <FileText size={20} /> নোট যোগ করুন
          </button>
          <button onClick={() => setIsLinkModalOpen(true)} className="btn-secondary">
            <LinkIcon size={20} /> লিংক যোগ করুন
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-10">
          <div className="space-y-6">
            <h3 className="text-xl font-black text-forest-900 flex items-center gap-4 px-2">
              <div className="w-10 h-10 bg-forest-900 rounded-[1rem] flex items-center justify-center text-white">
                <FileText size={20} />
              </div>
              নোট সমূহ
            </h3>
            <div className="grid gap-6">
              {data.notes.length === 0 ? (
                <div className="bg-white rounded-[3rem] p-16 text-center border border-sage-100/50">
                  <FileText size={48} className="mx-auto text-sage-100 mb-4" />
                  <p className="text-sage-400 font-bold">কোন নোট নেই</p>
                </div>
              ) : (
                data.notes.map(note => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={note.id} 
                    onClick={() => setEditingNote(note)}
                    className="bg-white p-8 rounded-[2.5rem] border border-sage-100/50 shadow-sm hover:border-sage-200 transition-all group cursor-pointer"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-bold text-2xl text-forest-900">{note.name}</h4>
                      <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(note.content); showToast('নোট কপি করা হয়েছে'); }} className="p-3 bg-sage-50 text-sage-400 hover:text-forest-900 hover:bg-sage-100 rounded-2xl transition-all">
                          <Copy size={18} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'notes', id: note.id }); }} className="p-3 bg-sage-50 text-sage-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sage-500 leading-relaxed line-clamp-3 font-medium">{note.content}</p>
                    <button className="mt-6 flex items-center gap-2 text-xs font-black text-forest-900 bg-sage-50 px-5 py-3 rounded-full hover:bg-sage-100 transition-all">
                      <ChevronRight size={14} /> বিস্তারিত দেখুন
                    </button>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-black text-forest-900 flex items-center gap-4 px-2">
              <div className="w-10 h-10 bg-forest-900 rounded-[1rem] flex items-center justify-center text-white">
                <LinkIcon size={20} />
              </div>
              প্রয়োজনীয় লিংক
            </h3>
            <div className="grid gap-4">
              {data.links.length === 0 ? (
                <div className="bg-white rounded-[3rem] p-16 text-center border border-sage-100/50">
                  <LinkIcon size={48} className="mx-auto text-sage-100 mb-4" />
                  <p className="text-sage-400 font-bold">কোন লিংক নেই</p>
                </div>
              ) : (
                data.links.map(link => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={link.id} 
                    onClick={() => setEditingLink(link)}
                    className="bg-white p-6 rounded-[2.5rem] border border-sage-100/50 shadow-sm hover:border-sage-200 transition-all group flex justify-between items-center cursor-pointer"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-[1.5rem] bg-sage-50 flex items-center justify-center text-sage-400 group-hover:bg-forest-900 group-hover:text-white transition-colors">
                        <ExternalLink size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-xl text-forest-900">{link.name}</h4>
                        <p className="text-xs font-bold text-sage-400 truncate max-w-[150px]">{link.url}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a href={link.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-3 text-sage-200 hover:text-forest-900 hover:bg-sage-50 rounded-2xl transition-all">
                        <ExternalLink size={20} />
                      </a>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'links', id: link.id }); }} className="p-3 text-sage-200 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AnalyticsPage = () => {
    const [filter, setFilter] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

    const filteredReports = useMemo(() => {
      const now = new Date();
      return data.reports.filter(r => {
        if (!r.timestamp) return false;
        const d = new Date(r.timestamp);
        if (isNaN(d.getTime())) return false;
        
        if (filter === 'daily') return d.toDateString() === now.toDateString();
        if (filter === 'weekly') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return d >= weekAgo;
        }
        if (filter === 'monthly') {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }, [data.reports, filter]);

    const deviceStats = useMemo(() => {
      const stats: Record<string, { 
        id: string, 
        name: string, 
        income: number, 
        tasks: number, 
        reports: Report[],
        accounts: Record<string, { email: string, income: number, tasks: number }>
      }> = {};
      
      filteredReports.forEach(r => {
        if (!stats[r.deviceId]) {
          stats[r.deviceId] = { id: r.deviceId, name: r.deviceName || 'Unknown', income: 0, tasks: 0, reports: [], accounts: {} };
        }
        stats[r.deviceId].income += Number(r.income || 0);
        stats[r.deviceId].tasks += 1;
        stats[r.deviceId].reports.push(r);
        
        const accId = r.accountId || 'unknown';
        if (!stats[r.deviceId].accounts[accId]) {
          stats[r.deviceId].accounts[accId] = { email: r.accountEmail || 'Unknown Account', income: 0, tasks: 0 };
        }
        stats[r.deviceId].accounts[accId].income += Number(r.income || 0);
        stats[r.deviceId].accounts[accId].tasks += 1;
      });
      return Object.values(stats).sort((a, b) => b.income - a.income);
    }, [filteredReports]);

    const downloadPDF = async () => {
      const invoiceElement = document.getElementById('admin-invoice-template');
      if (!invoiceElement) return;

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
        doc.save(`admin-report-${filter}-${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (error) {
        console.error('Error generating PDF:', error);
        showToast('PDF তৈরি করতে সমস্যা হয়েছে', 'error');
      } finally {
        invoiceElement.style.display = 'none';
      }
    };

    return (
      <div className="space-y-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-4xl font-black text-forest-900 tracking-tight">অ্যানালাইসিস ও রিপোর্ট</h2>
            <p className="text-sage-400 font-bold text-lg mt-2">ডিভাইস ও অ্যাকাউন্ট ভিত্তিক আয়ের হিসাব</p>
          </div>
          <button onClick={downloadPDF} className="btn-primary flex items-center gap-2">
            <Download size={20} /> PDF ডাউনলোড
          </button>
        </div>

        <div className="bg-white p-8 rounded-[3.5rem] border border-sage-100/50 shadow-sm space-y-8">
          <div className="flex gap-2 border-b border-sage-100 pb-4 overflow-x-auto">
            <button onClick={() => setFilter('daily')} className={`px-6 py-3 rounded-full text-sm font-black whitespace-nowrap transition-all ${filter === 'daily' ? 'bg-forest-900 text-white' : 'bg-sage-50 text-sage-400 hover:bg-sage-100'}`}>দৈনিক (আজ)</button>
            <button onClick={() => setFilter('weekly')} className={`px-6 py-3 rounded-full text-sm font-black whitespace-nowrap transition-all ${filter === 'weekly' ? 'bg-forest-900 text-white' : 'bg-sage-50 text-sage-400 hover:bg-sage-100'}`}>সাপ্তাহিক</button>
            <button onClick={() => setFilter('monthly')} className={`px-6 py-3 rounded-full text-sm font-black whitespace-nowrap transition-all ${filter === 'monthly' ? 'bg-forest-900 text-white' : 'bg-sage-50 text-sage-400 hover:bg-sage-100'}`}>মাসিক</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-sage-100">
                  <th className="py-4 px-6 text-sm font-black text-sage-400 uppercase tracking-widest">ডিভাইসের নাম</th>
                  <th className="py-4 px-6 text-sm font-black text-sage-400 uppercase tracking-widest text-center">সম্পন্ন কাজ</th>
                  <th className="py-4 px-6 text-sm font-black text-sage-400 uppercase tracking-widest text-right">মোট আয়</th>
                </tr>
              </thead>
              <tbody>
                {deviceStats.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-sage-400 font-bold">কোনো ডাটা পাওয়া যায়নি</td>
                  </tr>
                ) : (
                  deviceStats.map((stat, i) => (
                    <React.Fragment key={i}>
                      <tr 
                        onClick={() => setExpandedDevice(expandedDevice === stat.id ? null : stat.id)}
                        className="border-b border-sage-50 hover:bg-sage-50/50 transition-colors cursor-pointer"
                      >
                        <td className="py-4 px-6 font-bold text-forest-900 flex items-center gap-2">
                          {expandedDevice === stat.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          {stat.name}
                        </td>
                        <td className="py-4 px-6 font-bold text-sage-500 text-center">{stat.tasks}</td>
                        <td className="py-4 px-6 font-black text-forest-900 text-right">${stat.income.toFixed(2)}</td>
                      </tr>
                      {expandedDevice === stat.id && (
                        <tr>
                          <td colSpan={3} className="bg-sage-50/30 p-0">
                            <div className="px-12 py-4">
                              <h5 className="text-xs font-black text-sage-400 uppercase tracking-widest mb-3">সম্পন্ন কাজের তালিকা</h5>
                              <div className="space-y-2">
                                {stat.reports.map(report => (
                                  <div key={report.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-sage-100/50">
                                    <div>
                                      <p className="font-bold text-forest-900 text-sm">{report.taskName}</p>
                                      <p className="text-xs text-sage-400">
                                        {report.timestamp && !isNaN(new Date(report.timestamp).getTime())
                                          ? new Date(report.timestamp).toLocaleTimeString()
                                          : 'N/A'}
                                      </p>
                                    </div>
                                    <span className="font-black text-forest-900 text-sm">${report.income}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div id="admin-invoice-template" style={{ display: 'none', width: '800px', padding: '40px', background: 'white', color: 'black', fontFamily: "'Hind Siliguri', sans-serif", minHeight: '1000px', flexDirection: 'column' }}>
          <div style={{ marginBottom: '30px' }}>
            <h1 style={{ color: '#14532d', fontSize: '32px', fontWeight: '900', margin: '0 0 10px 0' }}>আয় রিপোর্ট</h1>
            <div style={{ color: '#666', fontSize: '14px', lineHeight: '1.6' }}>
              <p style={{ margin: '0' }}>মোহাম্মদ আল আমিন মীর</p>
              <p style={{ margin: '0' }}>তারিখ: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
              <p style={{ margin: '0' }}>ফিল্টার: {filter === 'daily' ? 'দৈনিক' : filter === 'weekly' ? 'সাপ্তাহিক' : 'মাসিক'}</p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 'auto' }}>
            <thead>
              <tr style={{ background: '#14532d', color: 'white', textAlign: 'left' }}>
                <th style={{ padding: '12px', border: '1px solid #14532d' }}>ডিভাইস</th>
                <th style={{ padding: '12px', border: '1px solid #14532d' }}>অ্যাকাউন্ট</th>
                <th style={{ padding: '12px', border: '1px solid #14532d', textAlign: 'center' }}>মোট কাজ</th>
                <th style={{ padding: '12px', border: '1px solid #14532d', textAlign: 'right' }}>মোট আয়</th>
              </tr>
            </thead>
            <tbody>
              {deviceStats.map((stat, idx) => {
                const accounts = Object.values(stat.accounts);
                return (
                  <React.Fragment key={idx}>
                    {accounts.map((acc, aIdx) => (
                      <tr key={`${idx}-${aIdx}`} style={{ background: aIdx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                        {aIdx === 0 && (
                          <td rowSpan={accounts.length} style={{ padding: '12px', border: '1px solid #e5e7eb', fontWeight: 'bold' }}>{stat.name}</td>
                        )}
                        <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>{acc.email}</td>
                        <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{acc.tasks}</td>
                        <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'right' }}>${acc.income.toFixed(2)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: '40px', borderTop: '2px solid #14532d', paddingTop: '20px', textAlign: 'right' }}>
            <span style={{ fontSize: '20px', fontWeight: '900', color: '#14532d' }}>
              সর্বমোট আয়: ${deviceStats.reduce((sum, s) => sum + s.income, 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // --- Layout ---

  const NavItem = ({ id, icon: Icon, label, isDesktop = false }: { id: string, icon: any, label: string, isDesktop?: boolean }) => (
    <button 
      onClick={() => { 
        setActiveTab(id); 
        if (!isDesktop) setIsSidebarOpen(false); 
      }}
      className={`group flex items-center gap-4 transition-all relative ${
        isDesktop 
          ? `px-4 py-2 rounded-xl ${activeTab === id ? 'bg-forest-900 text-white shadow-lg shadow-forest-900/10' : 'text-sage-400 hover:text-forest-900 hover:bg-sage-50'}`
          : `px-8 py-5 w-full ${activeTab === id ? 'text-forest-900 font-black' : 'text-sage-400 hover:text-sage-600'}`
      }`}
    >
      {activeTab === id && !isDesktop && (
        <motion.div 
          layoutId="activeNav"
          className="absolute inset-y-2 left-4 right-4 bg-sage-100/50 rounded-[1.5rem] -z-10"
        />
      )}
      <Icon size={isDesktop ? 18 : 22} className={activeTab === id ? (isDesktop ? 'text-white' : 'text-forest-900') : 'text-sage-300 group-hover:text-sage-400'} />
      <span className={isDesktop ? 'text-xs font-bold' : 'text-lg'}>{label}</span>
    </button>
  );

  useEffect(() => {
    // Redirection logic removed to allow access to all pages
  }, [user, isAuthReady, activeTab]);

  if (!isAuthReady || isUserDeviceLoading || isDataLoading) {
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
    return (
      <div className="min-h-screen bg-sage-50 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-12 rounded-[4rem] shadow-2xl max-w-lg w-full text-center space-y-8 border border-sage-100"
        >
          <div className="w-24 h-24 bg-forest-900 rounded-[2.5rem] flex items-center justify-center text-white mx-auto shadow-2xl shadow-forest-900/20">
            <LayoutDashboard size={48} />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-black text-forest-900 tracking-tight">মাইক্রোজব ম্যানেজার</h1>
            <p className="text-sage-500 font-medium text-lg">আপনার সব কাজের হিসাব এক জায়গায়। শুরু করতে লগইন করুন।</p>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
            {authError && (
              <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-sm font-bold text-center">
                {authError}
              </div>
            )}
            {isSignUp && (
              <div className="space-y-2">
                <label className="text-sm font-black text-forest-900 uppercase tracking-widest">আপনার নাম</label>
                <input 
                  type="text" 
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  required 
                  className="input-field" 
                  placeholder="আপনার পুরো নাম" 
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-black text-forest-900 uppercase tracking-widest">ইমেইল</label>
              <input 
                type="email" 
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required 
                className="input-field" 
                placeholder="আপনার ইমেইল" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-black text-forest-900 uppercase tracking-widest">পাসওয়ার্ড</label>
              <input 
                type="password" 
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required 
                className="input-field" 
                placeholder="••••••••" 
              />
            </div>
            <button 
              type="submit"
              disabled={isAuthLoading}
              className="w-full bg-forest-900 hover:bg-forest-800 text-white font-black py-4 rounded-[2rem] flex items-center justify-center gap-4 transition-all active:scale-95 shadow-xl shadow-forest-900/10 disabled:opacity-50"
            >
              {isAuthLoading ? 'অপেক্ষা করুন...' : (isSignUp ? 'অ্যাকাউন্ট তৈরি করুন' : 'লগইন করুন')}
            </button>
          </form>

          <div className="flex items-center gap-4">
            <div className="h-px bg-sage-100 flex-1"></div>
            <span className="text-sage-400 font-bold text-sm uppercase">অথবা</span>
            <div className="h-px bg-sage-100 flex-1"></div>
          </div>

          <button 
            onClick={handleGoogleAuth}
            disabled={isAuthLoading}
            className="w-full bg-white border-2 border-sage-100 hover:border-forest-900 text-forest-900 font-black py-4 rounded-[2rem] flex items-center justify-center gap-4 transition-all active:scale-95 disabled:opacity-50"
          >
            <LogIn size={24} />
            Google দিয়ে লগইন করুন
          </button>

          <button 
            onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }}
            className="text-sm font-bold text-forest-900 hover:text-forest-700 transition-colors"
          >
            {isSignUp ? 'ইতিমধ্যে অ্যাকাউন্ট আছে? লগইন করুন' : 'অ্যাকাউন্ট নেই? নতুন তৈরি করুন'}
          </button>
        </motion.div>
      </div>
    );
  }

  if (!isAdmin) {
    return <UserApp />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-sage-50">
      {/* Desktop Header Navigation */}
      <header className="hidden lg:flex bg-white border-b border-sage-100 sticky top-0 z-[60] px-12 py-4 justify-between items-center shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-forest-900 rounded-xl flex items-center justify-center text-white text-xl font-black shadow-lg shadow-forest-900/10">M</div>
            <h1 className="text-xl font-black text-forest-900 tracking-tight">ড্যাশবোর্ড</h1>
          </div>
          <nav className="flex items-center gap-2">
            <NavItem id="home" icon={LayoutDashboard} label="ড্যাশবোর্ড" isDesktop />
            <NavItem id="tasks" icon={Briefcase} label="টাস্ক" isDesktop />
            <NavItem id="accounts" icon={Users} label="অ্যাকাউন্ট" isDesktop />
            <NavItem id="analytics" icon={BarChart3} label="অ্যানালাইসিস" isDesktop />
            <NavItem id="media" icon={Share2} label="মিডিয়া" isDesktop />
          </nav>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest">স্বাগতম</p>
            <h2 className="text-sm font-black text-forest-900">
              {user?.displayName || 'মোহাম্মদ আল আমিন মীর'}
            </h2>
          </div>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-10 h-10 rounded-xl bg-sage-50 dark:bg-dark-border text-forest-900 dark:text-dark-accent flex items-center justify-center hover:bg-sage-100 transition-all"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => logOut()} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="lg:hidden bg-white/80 backdrop-blur-md border-b border-sage-100 p-6 flex justify-between items-center sticky top-0 z-[60]">
        <div className="flex flex-col">
          <p className="text-[10px] font-black text-sage-400 uppercase tracking-widest">স্বাগতম</p>
          <h1 className="text-lg font-black text-forest-900 truncate max-w-[150px]">
            {user?.displayName || 'মোহাম্মদ আল আমিন মীর'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-3 bg-sage-50 rounded-xl text-forest-900 active:scale-90 transition-all"
          >
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
          <button onClick={() => setIsSidebarOpen(true)} className="p-3 bg-sage-50 rounded-xl text-forest-900 active:scale-90 transition-all">
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Sidebar (Mobile Only) */}
      <aside 
        className={`fixed inset-y-0 left-0 z-[70] w-80 bg-white border-r border-sage-100 shadow-2xl lg:hidden h-screen flex flex-col no-scrollbar transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-10 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forest-900 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-forest-900/10">M</div>
            <h1 className="text-2xl font-black text-forest-900 tracking-tight">ড্যাশবোর্ড</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-3 bg-sage-50 rounded-xl text-forest-900">
            <X size={24} />
          </button>
        </div>
        <nav className="flex-1 mt-6 space-y-2 px-4">
          <NavItem id="home" icon={LayoutDashboard} label="ড্যাশবোর্ড" />
          <NavItem id="tasks" icon={Briefcase} label="টাস্ক ম্যানেজমেন্ট" />
          <NavItem id="accounts" icon={Users} label="অ্যাকাউন্ট সমূহ" />
          <NavItem id="analytics" icon={BarChart3} label="অ্যানালাইসিস" />
          <NavItem id="media" icon={Share2} label="মিডিয়া শেয়ার" />
        </nav>
        <div className="p-6 border-t border-sage-100">
          <button 
            onClick={() => logOut()}
            className="w-full flex items-center gap-4 p-4 text-sage-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all font-bold"
          >
            <LogOut size={24} />
            <span>লগ আউট</span>
          </button>
        </div>
        <div className="p-10">
          <div className="bg-sage-50 p-6 rounded-[2rem] text-center border border-sage-100/50">
            <p className="text-xs font-black text-sage-400 uppercase tracking-widest">ভার্সন ১.০.০</p>
            <p className="text-[10px] text-sage-300 mt-2">© ২০২৬ মাইক্রোজব ম্যানেজার</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-12 max-w-7xl mx-auto w-full no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {activeTab === 'home' && <HomePage />}
            {activeTab === 'tasks' && <TaskPage />}
            {activeTab === 'accounts' && <AccountPage />}
            {activeTab === 'analytics' && <AnalyticsPage />}
            {activeTab === 'media' && <MediaPage />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Overlay for mobile sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-forest-900/40 backdrop-blur-sm z-[65] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      {/* Modals */}
      <ConfirmModal />
      <NotificationsModal />

      {/* Task Modal (Add/Edit) */}
      <Modal 
        isOpen={isTaskModalOpen || !!editingTask} 
        onClose={() => { setIsTaskModalOpen(false); setEditingTask(null); }} 
        title={editingTask ? "টাস্ক আপডেট করুন" : "নতুন টাস্ক যোগ করুন"}
      >
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = e.target as any;
          const taskData = {
            name: f.taskName.value,
            income: Number(f.income.value),
            link: f.link.value,
            categoryId: f.catId.value
          };
          if (editingTask) {
            editTask({ ...editingTask, ...taskData });
          } else {
            addTask(taskData);
          }
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">ক্যাটাগরি</label>
            <div className="relative">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <select name="catId" defaultValue={editingTask?.categoryId || ""} required className="input-field pl-12">
                <option value="" disabled>ক্যাটাগরি নির্বাচন করুন</option>
                {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">টাস্কের নাম</label>
            <div className="relative">
              <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="taskName" defaultValue={editingTask?.name || ""} required className="input-field pl-12" placeholder="টাস্কের নাম লিখুন" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-black text-forest-900 uppercase tracking-widest">আয় ($)</label>
              <div className="relative">
                <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
                <input name="income" type="number" step="any" defaultValue={editingTask?.income || ""} required className="input-field pl-12" placeholder="০.০০" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-black text-forest-900 uppercase tracking-widest">লিংক/আইডি</label>
              <div className="relative">
                <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
                <input name="link" defaultValue={editingTask?.link || ""} required className="input-field pl-12" placeholder="লিংক বা আইডি" />
              </div>
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => { setIsTaskModalOpen(false); setEditingTask(null); }} className="btn-secondary flex-1 py-4">বাতিল</button>
            <button type="submit" className="btn-primary flex-1 py-4">{editingTask ? "আপডেট করুন" : "সংরক্ষণ করুন"}</button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal isOpen={isCatModalOpen} onClose={() => setIsCatModalOpen(false)} title="নতুন ক্যাটাগরি">
        <form onSubmit={(e) => {
          e.preventDefault();
          const name = (e.target as any).catName.value;
          addCategory(name);
          setIsCatModalOpen(false);
        }} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">ক্যাটাগরির নাম</label>
            <div className="relative">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="catName" required className="input-field pl-12" placeholder="যেমন: ফেসবুক, ইউটিউব..." />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full py-4 text-lg">সংরক্ষণ করুন</button>
        </form>
      </Modal>

      {/* Category List Modal */}
      <Modal isOpen={isCatListModalOpen} onClose={() => setIsCatListModalOpen(false)} title="ক্যাটাগরি তালিকা">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {data.categories.length === 0 ? (
            <p className="text-center text-sage-400 font-bold py-4">কোনো ক্যাটাগরি পাওয়া যায়নি</p>
          ) : (
            data.categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-4 bg-sage-50 rounded-2xl border border-sage-100">
                <span className="font-bold text-forest-900">{cat.name}</span>
                <button 
                  onClick={() => setConfirmDelete({ type: 'categories', id: cat.id })}
                  className="p-2 text-sage-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Device Modal */}
      <Modal isOpen={isDeviceModalOpen} onClose={() => setIsDeviceModalOpen(false)} title="নতুন ডিভাইস">
        <form onSubmit={(e) => {
          e.preventDefault();
          addDevice((e.target as any).deviceName.value);
          setIsDeviceModalOpen(false);
        }} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">ডিভাইসের নাম</label>
            <div className="relative">
              <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="deviceName" required className="input-field pl-12" placeholder="যেমন: মোবাইল ১, পিসি ২..." />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full py-4 text-lg">সংরক্ষণ করুন</button>
        </form>
      </Modal>

      {/* Account Modal (Add/Edit) */}
      <Modal 
        isOpen={isAccModalOpen || !!editingAccount} 
        onClose={() => { setIsAccModalOpen(false); setEditingAccount(null); }} 
        title={editingAccount ? "অ্যাকাউন্ট আপডেট করুন" : "নতুন অ্যাকাউন্ট যোগ করুন"}
      >
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = e.target as any;
          const accData = {
            deviceId: f.deviceId.value,
            name: f.name.value,
            siteName: f.siteName.value,
            email: f.email.value,
            password: f.password.value,
            link: f.link.value,
            notes: f.notes.value
          };
          if (editingAccount) {
            editAccount({ ...editingAccount, ...accData });
          } else {
            addAccount(accData);
          }
          setIsAccModalOpen(false);
          setEditingAccount(null);
        }} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">ডিভাইস নির্বাচন করুন</label>
            <div className="relative">
              <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <select name="deviceId" defaultValue={editingAccount?.deviceId || ""} required className="input-field pl-12">
                <option value="" disabled>ডিভাইস নির্বাচন করুন</option>
                {data.devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">অ্যাকাউন্টের নাম</label>
            <div className="relative">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="name" defaultValue={editingAccount?.name || ""} required className="input-field pl-12" placeholder="যেমন: জন ডো, পার্সোনাল ১..." />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">সাইটের নাম</label>
            <div className="relative">
              <LayoutDashboard className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="siteName" defaultValue={editingAccount?.siteName || ""} required className="input-field pl-12" placeholder="যেমন: ফেসবুক, জিমেইল..." />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">ইমেইল / ইউজারনেম</label>
            <div className="relative">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="email" defaultValue={editingAccount?.email || ""} required className="input-field pl-12" placeholder="example@mail.com" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">পাসওয়ার্ড</label>
            <div className="relative">
              <Eye className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="password" defaultValue={editingAccount?.password || ""} required className="input-field pl-12" placeholder="••••••••" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">লিংক (ঐচ্ছিক)</label>
            <div className="relative">
              <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="link" defaultValue={editingAccount?.link || ""} className="input-field pl-12" placeholder="https://..." />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">নোটস (ঐচ্ছিক)</label>
            <div className="relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <textarea name="notes" defaultValue={editingAccount?.notes || ""} className="input-field pl-12 min-h-[100px] py-3" placeholder="অ্যাকাউন্ট সম্পর্কে অতিরিক্ত তথ্য..." />
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => { setIsAccModalOpen(false); setEditingAccount(null); }} className="btn-secondary flex-1 py-4">বাতিল</button>
            <button type="submit" className="btn-primary flex-1 py-4">{editingAccount ? "আপডেট করুন" : "সংরক্ষণ করুন"}</button>
          </div>
        </form>
      </Modal>

      {/* Note Modal (Add/Edit) */}
      <Modal 
        isOpen={isNoteModalOpen || !!editingNote} 
        onClose={() => { setIsNoteModalOpen(false); setEditingNote(null); }} 
        title={editingNote ? "নোট আপডেট করুন" : "নতুন নোট যোগ করুন"}
      >
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = e.target as any;
          if (editingNote) {
            editNote({ ...editingNote, name: f.noteName.value, content: f.noteContent.value });
          } else {
            addNote(f.noteName.value, f.noteContent.value);
          }
          setIsNoteModalOpen(false);
          setEditingNote(null);
        }} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">নোটের নাম</label>
            <div className="relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="noteName" defaultValue={editingNote?.name || ""} required className="input-field pl-12" placeholder="নোটের শিরোনাম" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">নোট লিখুন</label>
            <textarea name="noteContent" defaultValue={editingNote?.content || ""} required className="input-field h-48 resize-none p-6" placeholder="আপনার নোট এখানে লিখুন..." />
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => { setIsNoteModalOpen(false); setEditingNote(null); }} className="btn-secondary flex-1 py-4">বাতিল</button>
            <button type="submit" className="btn-primary flex-1 py-4">{editingNote ? "আপডেট করুন" : "সংরক্ষণ করুন"}</button>
          </div>
        </form>
      </Modal>

      {/* Link Modal (Add/Edit) */}
      <Modal 
        isOpen={isLinkModalOpen || !!editingLink} 
        onClose={() => { setIsLinkModalOpen(false); setEditingLink(null); }} 
        title={editingLink ? "লিংক আপডেট করুন" : "নতুন লিংক যোগ করুন"}
      >
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = e.target as any;
          const linkData = { name: f.linkName.value, url: f.linkUrl.value };
          if (editingLink) {
            const updatedLink = { ...editingLink, ...linkData };
            updateFirestore('links', updatedLink);
            showToast('লিংক আপডেট করা হয়েছে');
          } else {
            addLink(linkData.name, linkData.url);
          }
          setIsLinkModalOpen(false);
          setEditingLink(null);
        }} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">লিংকের নাম</label>
            <div className="relative">
              <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="linkName" defaultValue={editingLink?.name || ""} required className="input-field pl-12" placeholder="লিংকের নাম" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-black text-forest-900 uppercase tracking-widest">লিংক (URL)</label>
            <div className="relative">
              <ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 text-sage-300" size={18} />
              <input name="linkUrl" type="url" defaultValue={editingLink?.url || ""} required className="input-field pl-12" placeholder="https://example.com" />
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => { setIsLinkModalOpen(false); setEditingLink(null); }} className="btn-secondary flex-1 py-4">বাতিল</button>
            <button type="submit" className="btn-primary flex-1 py-4">{editingLink ? "আপডেট করুন" : "সংরক্ষণ করুন"}</button>
          </div>
        </form>
      </Modal>

      <AnimatePresence>
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
