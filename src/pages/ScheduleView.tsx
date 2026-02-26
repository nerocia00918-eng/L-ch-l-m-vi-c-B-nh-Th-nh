import { useState, useEffect, useMemo, useRef } from 'react';
import React from 'react';
import { format, addDays, startOfWeek, subWeeks, isBefore, addHours, parseISO, isSameDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { User, socket } from '../App';
import { ChevronLeft, ChevronRight, Copy, Lock, Search, Filter, Calendar as CalendarIcon, Camera, Info, Wand2, X, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import html2canvas from 'html2canvas';

interface Employee {
  id: number;
  code: string;
  name: string;
  department: string;
  role: string;
}

interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  text_color: string;
}

interface Task {
  id: number;
  department: string;
  name: string;
  color: string;
  text_color: string;
}

interface Schedule {
  id: number;
  date: string;
  employee_id: number;
  shift_id: number;
  task: string;
  status: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  color: string;
  text_color: string;
  note?: string;
}

export default function ScheduleView({ user }: { user: User | null }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [selectedCell, setSelectedCell] = useState<{ date: string; empId: number } | null>(null);
  const [editData, setEditData] = useState({ shift_id: 0, task: 'Không', note: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const start = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const end = format(addDays(parseISO(start), 6), 'yyyy-MM-dd');

      const [empRes, shiftRes, schedRes, taskRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/shifts'),
        fetch(`/api/schedules?start=${start}&end=${end}`),
        fetch(`/api/tasks?department=${user?.department || 'All'}`)
      ]);

      const [empData, shiftData, schedData, taskData] = await Promise.all([
        empRes.json(),
        shiftRes.json(),
        schedRes.json(),
        taskRes.json()
      ]);

      setEmployees(empData);
      setShifts(shiftData);
      setSchedules(schedData);
      setTasks(taskData);
      if (shiftData.length > 0 && editData.shift_id === 0) {
        setEditData(prev => ({ ...prev, shift_id: shiftData[0].id }));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    socket.on('schedules:updated', fetchData);
    socket.on('employees:updated', fetchData);
    socket.on('tasks:updated', fetchData);
    return () => {
      socket.off('schedules:updated');
      socket.off('employees:updated');
      socket.off('tasks:updated');
    };
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = deptFilter === 'All' || emp.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [employees, searchTerm, deptFilter]);

  const handleCellClick = (date: Date, empId: number) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const sched = schedules.find(s => s.date === dateStr && s.employee_id === empId);
    
    setSelectedCell({ date: dateStr, empId });
    setEditData({
      shift_id: sched?.shift_id || (shifts.length > 0 ? shifts[0].id : 0),
      task: (sched && sched.task && sched.task !== 'Tăng ca') ? sched.task : 'Không',
      note: sched?.note || ''
    });
  };

  const saveSchedule = async () => {
    if (!selectedCell) return;

    // Chặn "Tăng ca" trước khi gửi lên máy chủ
    let finalTask = editData.task;
    if (finalTask === 'Tăng ca') {
      finalTask = 'Không';
    }

    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedCell.date,
          employee_id: selectedCell.empId,
          shift_id: editData.shift_id,
          task: finalTask,
          status: 'Published',
          note: editData.note
        })
      });
      setSelectedCell(null);
      fetchData();
    } catch (error) {
      alert('Lỗi khi lưu lịch làm việc');
    }
  };

  const autoSchedule = async () => {
    if (!confirm('Hệ thống sẽ tự động phân bổ Hotline, Trực cửa, Vệ sinh cho tuần này. Bạn chắc chắn chứ?')) return;
    
    const newSchedules = [];
    const deptEmployees = employees.filter(e => e.department === user?.department);
    
    for (const day of weekDays.map(d => format(d, 'yyyy-MM-dd'))) {
      const daySchedules = schedules.filter(s => s.date === day);
      const morningPool = deptEmployees.filter(e => {
        const s = daySchedules.find(sd => sd.employee_id === e.id);
        return s?.shift_name === 'SÁNG';
      });
      const afternoonPool = deptEmployees.filter(e => {
        const s = daySchedules.find(sd => sd.employee_id === e.id);
        return s?.shift_name === 'CHIỀU';
      });

      // Logic xếp ca sáng
      const morningHotline = morningPool[0];
      const morningTruc = morningPool.find(e => e.id !== morningHotline?.id) || morningPool[1];

      morningPool.forEach(emp => {
        let task = 'Không';
        if (emp.id === morningHotline?.id) task = 'Hotline';
        else if (emp.id === morningTruc?.id) task = 'Trực cửa';
        else task = 'Không'; // Đảm bảo không nhảy "Tăng ca"

        newSchedules.push({
          date: day,
          employee_id: emp.id,
          shift_id: daySchedules.find(s => s.employee_id === emp.id)?.shift_id,
          task: task,
          status: 'Published'
        });
      });

      // Logic xếp ca chiều
      const afternoonHotline = afternoonPool[0];
      const afternoonTruc = afternoonPool.find(e => e.id !== afternoonHotline?.id) || afternoonPool[1];
      const afternoonVeSinh = afternoonPool[2];

      afternoonPool.forEach(emp => {
        let task = 'Không';
        if (emp.id === afternoonHotline?.id) task = 'Hotline';
        else if (emp.id === afternoonTruc?.id) task = 'Trực cửa';
        else if (emp.id === afternoonVeSinh?.id) task = 'Vệ sinh';
        else task = 'Không'; // Đảm bảo không nhảy "Tăng ca"

        newSchedules.push({
          date: day,
          employee_id: emp.id,
          shift_id: daySchedules.find(s => s.employee_id === emp.id)?.shift_id,
          task: task,
          status: 'Published'
        });
      });
    }

    for (const s of newSchedules) {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      });
    }
    fetchData();
  };

  if (loading && schedules.length === 0) return <div className="p-8 text-center">Đang tải dữ liệu...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header & Filters */}
      <div className="p-4 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex flex-wrap items-center justify-between gap-4 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <CalendarIcon className="w-6 h-6 text-indigo-600" />
              Lịch làm việc
            </h1>
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <span className="px-4 text-sm font-bold text-slate-700 min-w-[180px] text-center">
                {format(weekDays[0], 'dd/MM')} - {format(weekDays[6], 'dd/MM/yyyy')}
              </span>
              <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all">
                <ChevronRight className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên hoặc mã NV..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {user?.role === 'Admin' && (
              <select
                className="bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 py-2 px-4"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="All">Tất cả bộ phận</option>
                {Array.from(new Set(employees.map(e => e.department))).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
            {user?.role !== 'Nhân viên' && (
              <button
                onClick={autoSchedule}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Wand2 className="w-4 h-4" />
                Xếp lịch tự động
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid Lịch */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-w-[1000px]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-20 w-[200px]">
                  Nhân viên
                </th>
                {weekDays.map(day => (
                  <th key={day.toString()} className={clsx(
                    "p-4 text-center border-l border-slate-100",
                    isSameDay(day, new Date()) && "bg-indigo-50/50"
                  )}>
                    <div className="text-xs font-bold text-slate-400 uppercase">{format(day, 'EEEE', { locale: vi })}</div>
                    <div className={clsx(
                      "text-lg font-black mt-1",
                      isSameDay(day, new Date()) ? "text-indigo-600" : "text-slate-700"
                    )}>
                      {format(day, 'dd/MM')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => (
                <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 sticky left-0 bg-white z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                    <div className="font-bold text-slate-800 text-sm">{emp.name}</div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">{emp.code} • {emp.department}</div>
                  </td>
                  {weekDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const sched = schedules.find(s => s.date === dateStr && s.employee_id === emp.id);
                    const canEdit = user?.role === 'Admin' || (user?.role === 'Tổ trưởng' && user.department === emp.department);

                    return (
                      <td
                        key={dateStr}
                        onClick={() => canEdit && handleCellClick(day, emp.id)}
                        className={clsx(
                          "p-2 border-l border-slate-50 h-[100px] vertical-top transition-all",
                          canEdit ? "cursor-pointer hover:bg-indigo-50/30" : "cursor-default",
                          isSameDay(day, new Date()) && "bg-indigo-50/20"
                        )}
                      >
                        {sched ? (
                          <div 
                            className="h-full rounded-xl p-2 flex flex-col justify-between shadow-sm relative overflow-hidden group"
                            style={{ backgroundColor: sched.color, color: sched.text_color }}
                          >
                            <div>
                              <div className="text-[10px] font-black uppercase opacity-80">{sched.shift_name}</div>
                              <div className="text-[11px] font-bold mt-0.5">{sched.start_time} - {sched.end_time}</div>
                            </div>
                            
                            {sched.task && sched.task !== 'Không' && sched.task !== 'Tăng ca' && (
                              <div className="mt-auto">
                                <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black bg-white/20 backdrop-blur-md">
                                  {sched.task}
                                </span>
                              </div>
                            )}

                            {sched.note && (
                              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Info className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-full border-2 border-dashed border-slate-100 rounded-xl flex items-center justify-center">
                            <span className="text-[10px] font-bold text-slate-300">TRỐNG</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal chỉnh sửa */}
      {selectedCell && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-lg font-black text-slate-800">Cập nhật lịch trực</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Ngày {format(parseISO(selectedCell.date), 'dd/MM/yyyy')}</p>
              </div>
              <button onClick={() => setSelectedCell(null)} className="p-2 hover:bg-white rounded-full shadow-sm transition-all text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Chọn ca làm việc</label>
                <div className="grid grid-cols-2 gap-2">
                  {shifts.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setEditData({ ...editData, shift_id: s.id })}
                      className={clsx(
                        "p-3 rounded-2xl text-left border-2 transition-all relative overflow-hidden",
                        editData.shift_id === s.id ? "border-indigo-600 ring-2 ring-indigo-100" : "border-slate-100 hover:border-slate-200"
                      )}
                      style={{ backgroundColor: editData.shift_id === s.id ? s.color : 'transparent' }}
                    >
                      <div className="text-xs font-black" style={{ color: editData.shift_id === s.id ? s.text_color : '#64748b' }}>{s.name}</div>
                      <div className="text-[10px] font-bold mt-0.5 opacity-60" style={{ color: editData.shift_id === s.id ? s.text_color : '#94a3b8' }}>{s.start_time}-{s.end_time}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Gán nhiệm vụ</label>
                <div className="flex flex-wrap gap-2">
                  {['Không', 'Hotline', 'Trực cửa', 'Vệ sinh'].map(t => (
                    <button
                      key={t}
                      onClick={() => setEditData({ ...editData, task: t })}
                      className={clsx(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                        editData.task === t ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Ghi chú (nếu có)</label>
                <textarea
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                  rows={3}
                  placeholder="Nhập ghi chú cho nhân viên..."
                  value={editData.note}
                  onChange={(e) => setEditData({ ...editData, note: e.target.value })}
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50/50 flex gap-3">
              <button onClick={() => setSelectedCell(null)} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">Hủy</button>
              <button onClick={saveSchedule} className="flex-[2] bg-indigo-600 text-white py-3 rounded-2xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                Xác nhận lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
