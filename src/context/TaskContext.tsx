import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TaskItem } from '../models/types';

// Initial tasks data (same as Flutter app)
const initialTasks: TaskItem[] = [
  {
    id: '1',
    title: 'Check HVAC filters',
    spot: 'Building A',
    priority: 'High',
    status: 'Open',
    assignees: ['Alex', 'Mia'],
    createdAt: 'Today 8:15 AM',
    tags: ['HVAC', 'Preventive'],
    approval: 'Awaiting lead',
    sla: null,
  },
  {
    id: '2',
    title: 'Inspect fire extinguishers',
    spot: 'Floor 3',
    priority: 'High',
    status: 'In progress',
    assignees: ['Sam'],
    createdAt: 'Today 7:50 AM',
    tags: ['Safety'],
    approval: null,
    sla: 'SLA 4h',
  },
  {
    id: '3',
    title: 'Clean lobby glass',
    spot: 'Main Lobby',
    priority: 'Low',
    status: 'Open',
    assignees: ['Leo', 'Cam'],
    createdAt: 'Yesterday 5:10 PM',
    tags: ['Cleaning'],
    approval: null,
    sla: null,
  },
  {
    id: '4',
    title: 'Test emergency lights',
    spot: 'Basement',
    priority: 'High',
    status: 'Blocked',
    assignees: ['Priya'],
    createdAt: 'Today 6:40 AM',
    tags: ['Safety', 'Electrical'],
    approval: null,
    sla: 'SLA breached',
  },
  {
    id: '5',
    title: 'Replace hallway bulbs',
    spot: 'Floor 2',
    priority: 'Medium',
    status: 'Open',
    assignees: ['Tom'],
    createdAt: 'Today 9:05 AM',
    tags: ['Electrical'],
    approval: null,
    sla: null,
  },
  {
    id: '6',
    title: 'Service elevator A',
    spot: 'Shaft 1',
    priority: 'High',
    status: 'Scheduled',
    assignees: ['Alex', 'Priya'],
    createdAt: 'Yesterday 4:30 PM',
    tags: ['Elevator'],
    approval: 'Ops approval',
    sla: null,
  },
  {
    id: '7',
    title: 'Calibrate thermostats',
    spot: 'Offices',
    priority: 'Medium',
    status: 'In progress',
    assignees: ['Mia'],
    createdAt: 'Today 8:45 AM',
    tags: ['HVAC'],
    approval: null,
    sla: null,
  },
  {
    id: '8',
    title: 'Patch wall paint',
    spot: 'Conference Room',
    priority: 'Low',
    status: 'Open',
    assignees: ['Cam'],
    createdAt: 'Yesterday 3:20 PM',
    tags: ['Paint'],
    approval: null,
    sla: null,
  },
  {
    id: '9',
    title: 'Check water pressure',
    spot: 'Roof Tank',
    priority: 'Medium',
    status: 'Open',
    assignees: ['Leo'],
    createdAt: 'Today 9:20 AM',
    tags: ['Plumbing'],
    approval: null,
    sla: null,
  },
  {
    id: '10',
    title: 'Clean AC ducts',
    spot: 'Wing C',
    priority: 'High',
    status: 'Scheduled',
    assignees: ['Sam', 'Priya'],
    createdAt: 'Yesterday 2:00 PM',
    tags: ['HVAC', 'Deep clean'],
    approval: null,
    sla: null,
  },
  {
    id: '11',
    title: 'Replace air filter',
    spot: 'Server Room',
    priority: 'High',
    status: 'In progress',
    assignees: ['Alex'],
    createdAt: 'Today 7:30 AM',
    tags: ['HVAC', 'Critical'],
    approval: null,
    sla: null,
  },
  {
    id: '12',
    title: 'Grease door hinges',
    spot: 'Storage',
    priority: 'Low',
    status: 'Done',
    assignees: ['Cam'],
    createdAt: 'Yesterday 11:40 AM',
    tags: ['General'],
    approval: null,
    sla: null,
  },
  {
    id: '13',
    title: 'Inspect sprinklers',
    spot: 'Floor 4',
    priority: 'High',
    status: 'Open',
    assignees: ['Tom', 'Leo'],
    createdAt: 'Today 8:05 AM',
    tags: ['Safety'],
    approval: null,
    sla: null,
  },
  {
    id: '14',
    title: 'Tile repair',
    spot: 'Restroom East',
    priority: 'Medium',
    status: 'Scheduled',
    assignees: ['Priya'],
    createdAt: 'Yesterday 1:55 PM',
    tags: ['Repairs'],
    approval: null,
    sla: null,
  },
  {
    id: '15',
    title: 'Check smoke detectors',
    spot: 'Dorm Wing',
    priority: 'High',
    status: 'Open',
    assignees: ['Sam'],
    createdAt: 'Today 9:10 AM',
    tags: ['Safety', 'Electrical'],
    approval: null,
    sla: null,
  },
  {
    id: '16',
    title: 'Refill janitorial stock',
    spot: 'Supply Closet',
    priority: 'Low',
    status: 'Open',
    assignees: ['Mia'],
    createdAt: 'Today 8:55 AM',
    tags: ['Supplies'],
    approval: null,
    sla: null,
  },
  {
    id: '17',
    title: 'Deep clean carpets',
    spot: 'Lobby',
    priority: 'Medium',
    status: 'Scheduled',
    assignees: ['Alex', 'Cam'],
    createdAt: 'Yesterday 2:45 PM',
    tags: ['Cleaning', 'Deep clean'],
    approval: null,
    sla: null,
  },
  {
    id: '18',
    title: 'Window seal inspection',
    spot: 'Floor 5',
    priority: 'Medium',
    status: 'Open',
    assignees: ['Leo'],
    createdAt: 'Today 7:20 AM',
    tags: ['Inspection'],
    approval: null,
    sla: null,
  },
  {
    id: '19',
    title: 'Test backup generator',
    spot: 'Utility Yard',
    priority: 'High',
    status: 'Scheduled',
    assignees: ['Tom', 'Priya'],
    createdAt: 'Yesterday 5:00 PM',
    tags: ['Power'],
    approval: null,
    sla: null,
  },
  {
    id: '20',
    title: 'Parking lines repaint',
    spot: 'Parking Lot',
    priority: 'Low',
    status: 'Open',
    assignees: ['Sam'],
    createdAt: 'Today 6:55 AM',
    tags: ['Paint'],
    approval: null,
    sla: null,
  },
];

interface TaskContextType {
  tasks: TaskItem[];
  activeTask: TaskItem | null;
  compactCards: boolean;
  notificationCount: number;
  selectedWorkspace: string;
  workspaces: string[];
  addTask: (task: TaskItem) => void;
  updateTask: (index: number, task: TaskItem) => void;
  setActiveTask: (task: TaskItem | null, markDone?: boolean) => void;
  toggleCompactCards: () => void;
  setNotificationCount: (count: number) => void;
  setSelectedWorkspace: (workspace: string) => void;
  markTaskDone: (taskId: string) => void;
  assignTaskToYou: (taskId: string) => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [activeTask, setActiveTaskState] = useState<TaskItem | null>(null);
  const [compactCards, setCompactCards] = useState(false);
  const [notificationCount, setNotificationCount] = useState(2);
  const [selectedWorkspace, setSelectedWorkspace] = useState('Everything');

  const workspaces = ['Everything', 'Shared', 'Workspace A', 'Workspace B', 'Workspace C'];

  const addTask = (task: TaskItem) => {
    const newTask = { ...task, id: String(Date.now()) };
    setTasks(prev => [newTask, ...prev]);
  };

  const updateTask = (index: number, task: TaskItem) => {
    setTasks(prev => {
      const newTasks = [...prev];
      newTasks[index] = task;
      return newTasks;
    });
  };

  const setActiveTask = (task: TaskItem | null, markDone = false) => {
    if (markDone && activeTask) {
      const activeIndex = tasks.findIndex(t => t.id === activeTask.id);
      if (activeIndex !== -1) {
        updateTask(activeIndex, { ...tasks[activeIndex], status: 'Done' });
      }
    }
    setActiveTaskState(task);
  };

  const toggleCompactCards = () => {
    setCompactCards(prev => !prev);
  };

  const markTaskDone = (taskId: string) => {
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
      updateTask(index, { ...tasks[index], status: 'Done' });
    }
    if (activeTask?.id === taskId) {
      setActiveTaskState(null);
    }
  };

  const assignTaskToYou = (taskId: string) => {
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1 && !tasks[index].assignees.includes('You')) {
      const updatedAssignees = [...tasks[index].assignees, 'You'];
      updateTask(index, { ...tasks[index], assignees: updatedAssignees });
    }
  };

  return (
    <TaskContext.Provider
      value={{
        tasks,
        activeTask,
        compactCards,
        notificationCount,
        selectedWorkspace,
        workspaces,
        addTask,
        updateTask,
        setActiveTask,
        toggleCompactCards,
        setNotificationCount,
        setSelectedWorkspace,
        markTaskDone,
        assignTaskToYou,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = (): TaskContextType => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
