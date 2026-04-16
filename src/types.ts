export interface Category {
  id: string;
  name: string;
  uid: string;
}

export interface Task {
  id: string;
  name: string;
  income: number;
  link: string;
  categoryId: string;
  createdAt: string;
  uid: string;
}

export interface Device {
  id: string;
  name: string;
  uid: string;
}

export interface Account {
  id: string;
  deviceId: string;
  name?: string;
  siteName: string;
  email: string;
  password: string;
  link?: string;
  notes?: string;
  uid: string;
}

export interface Note {
  id: string;
  name: string;
  content: string;
  uid: string;
}

export interface Link {
  id: string;
  name: string;
  url: string;
  uid: string;
}

export interface Report {
  id: string;
  taskId: string;
  taskName: string;
  income: number;
  deviceId: string;
  deviceName: string;
  accountId?: string;
  accountEmail?: string;
  timestamp: string;
  uid: string;
}

export interface TaskIssue {
  id: string;
  taskId: string;
  taskName: string;
  message: string;
  timestamp: string;
  status: 'pending' | 'resolved';
  uid: string;
}

export interface Activity {
  id: string;
  type: 'task' | 'account' | 'note' | 'link' | 'category' | 'device';
  action: 'create' | 'update' | 'delete';
  name: string;
  timestamp: string;
  uid: string;
}

export interface AppData {
  tasks: Task[];
  categories: Category[];
  accounts: Account[];
  devices: Device[];
  notes: Note[];
  links: Link[];
  reports: Report[];
  issues: TaskIssue[];
  activities: Activity[];
}
