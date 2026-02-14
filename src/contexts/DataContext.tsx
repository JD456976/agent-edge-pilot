import React, { createContext, useContext, useState } from 'react';
import type { Lead, Deal, Task, Alert } from '@/types';
import { demoLeads, demoDeals, demoTasks, demoAlerts } from '@/data/demo';

interface DataContextType {
  leads: Lead[];
  deals: Deal[];
  tasks: Task[];
  alerts: Alert[];
  hasData: boolean;
  lastSeedTime: string | null;
  seedDemoData: () => void;
  wipeData: () => void;
  completeTask: (id: string) => void;
  uncompleteTask: (id: string) => void;
  addTask: (task: Task) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const KEYS = ['dp-leads', 'dp-deals', 'dp-tasks', 'dp-alerts', 'dp-seed-time'] as const;

function load<T>(key: string): T | null {
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : null;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>(() => load('dp-leads') || []);
  const [deals, setDeals] = useState<Deal[]>(() => load('dp-deals') || []);
  const [tasks, setTasks] = useState<Task[]>(() => load('dp-tasks') || []);
  const [alerts, setAlerts] = useState<Alert[]>(() => load('dp-alerts') || []);
  const [lastSeedTime, setLastSeedTime] = useState<string | null>(() => localStorage.getItem('dp-seed-time'));

  const save = (l: Lead[], d: Deal[], t: Task[], a: Alert[]) => {
    setLeads(l); setDeals(d); setTasks(t); setAlerts(a);
    localStorage.setItem('dp-leads', JSON.stringify(l));
    localStorage.setItem('dp-deals', JSON.stringify(d));
    localStorage.setItem('dp-tasks', JSON.stringify(t));
    localStorage.setItem('dp-alerts', JSON.stringify(a));
  };

  const seedDemoData = () => {
    const time = new Date().toISOString();
    save(demoLeads, demoDeals, demoTasks, demoAlerts);
    setLastSeedTime(time);
    localStorage.setItem('dp-seed-time', time);
  };

  const wipeData = () => {
    save([], [], [], []);
    setLastSeedTime(null);
    localStorage.removeItem('dp-seed-time');
  };

  const completeTask = (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, completedAt: new Date().toISOString() } : t);
    setTasks(updated);
    localStorage.setItem('dp-tasks', JSON.stringify(updated));
  };

  const uncompleteTask = (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, completedAt: undefined } : t);
    setTasks(updated);
    localStorage.setItem('dp-tasks', JSON.stringify(updated));
  };

  const addTask = (task: Task) => {
    const updated = [...tasks, task];
    setTasks(updated);
    localStorage.setItem('dp-tasks', JSON.stringify(updated));
  };

  const hasData = leads.length > 0 || deals.length > 0 || tasks.length > 0;

  return (
    <DataContext.Provider value={{ leads, deals, tasks, alerts, hasData, lastSeedTime, seedDemoData, wipeData, completeTask, uncompleteTask, addTask }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
