import React, { useState, useEffect } from 'react';
import { Role, socket } from '../App';
import { Search, UserPlus, Edit2, Trash2, Calendar, UserCheck, UserX, Eye, EyeOff, Archive, X } from 'lucide-react';
import clsx from 'clsx';
import { normalizeDept } from './ScheduleView';

interface Employee {
  id: number;
  code: string;
  name: string;
  department: string;
  role: string;
  phone: string;
  start_date?: string;
  end_date?: string;
  is_hidden?: number | boolean;
}

const DEPARTMENTS = ['Quản lý', 'Bán hàng', 'Thu ngân', 'Kỹ thuật', 'Giao vận', 'Kho'];
const ROLES = ['Admin', 'Tổ trưởng', 'Nhân viên'];

export default function EmployeeList({ role }: { role: Role }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    department: 'Bán hàng',
    role: 'Nhân viên',
    phone: '',
    start_date: '',
    end_date: ''
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number, name: string } | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'visible' | 'hidden'>('all');
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  const fetchEmployees = async () => {
    const res = await fetch('/api/employees');
    const data = await res.json();
    setEmployees(data);
  };

  const toggleHide = async (id: number) => {
    try {
      const res = await fetch(`/api/employees/${id}/toggle-hide`, { method: 'PATCH' });
      if (res.ok) {
        fetchEmployees();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnhideAll = async () => {
    if (!confirm('Bạn có chắc muốn bật hiển thị tất cả nhân viên lên lịch làm việc?')) return;
    try {
      const res = await fetch('/api/employees/unhide-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: 'All' })
      });
      if (res.ok) {
        fetchEmployees();
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchEmployees();
    socket.on('employees:updated', fetchEmployees);
    return () => {
      socket.off('employees:updated', fetchEmployees);
    };
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-');
      if (y && m && d) return `${d}/${m}/${y}`;
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const getEmploymentStatus = (emp: Employee) => {
    if (emp.end_date) {
      const today = new Date().toISOString().split('T')[0];
      if (emp.end_date < today) {
        return { label: 'Đã nghỉ việc', isResigned: true, color: 'bg-red-50 text-red-700 border-red-200' };
      }
      return { label: `Nghỉ: ${formatDate(emp.end_date)}`, isResigned: false, color: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    return { label: 'Đang làm việc', isResigned: false, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormData({
      code: '',
      name: '',
      department: 'Bán hàng',
      role: 'Nhân viên',
      phone: '',
      start_date: '',
      end_date: ''
    });
    setShowForm(true);
  };

  const openEditForm = (emp: Employee) => {
    setEditingId(emp.id);
    setFormData({
      code: emp.code,
      name: emp.name,
      department: emp.department,
      role: emp.role,
      phone: emp.phone || '',
      start_date: emp.start_date || '',
      end_date: emp.end_date || ''
    });
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/employees/${deleteConfirm.id}`, { method: 'DELETE' });
      if (!res.ok) {
        alert('Lỗi khi xóa nhân viên');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
    setDeleteConfirm(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingId ? `/api/employees/${editingId}` : '/api/employees';
    const method = editingId ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    if (res.ok) {
      setShowForm(false);
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  const visibleCount = employees.filter(e => !e.is_hidden || e.is_hidden === 0 || e.is_hidden === false).length;
  const hiddenCount = employees.filter(e => e.is_hidden === 1 || e.is_hidden === '1' || e.is_hidden === true).length;

  const filtered = employees
    .filter(e => {
      const isHidden = e.is_hidden === 1 || e.is_hidden === '1' || e.is_hidden === true;
      if (filterTab === 'visible' && isHidden) return false;
      if (filterTab === 'hidden' && !isHidden) return false;

      const cleanSearch = search.trim().toLowerCase();
      if (!cleanSearch) return true;
      return (
        e.name.toLowerCase().includes(cleanSearch) || 
        e.code.toLowerCase().includes(cleanSearch) ||
        e.department.toLowerCase().includes(cleanSearch)
      );
    })
    .sort((a, b) => {
      const deptA = DEPARTMENTS.findIndex(d => normalizeDept(d) === normalizeDept(a.department));
      const deptB = DEPARTMENTS.findIndex(d => normalizeDept(d) === normalizeDept(b.department));
      if (deptA !== deptB) return (deptA === -1 ? 99 : deptA) - (deptB === -1 ? 99 : deptB);
      
      const roleA = ROLES.indexOf(a.role);
      const roleB = ROLES.indexOf(b.role);
      if (roleA !== roleB) return (roleA === -1 ? 99 : roleA) - (roleB === -1 ? 99 : roleB);
      
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Nhân sự / Staff</h2>
          <p className="text-slate-500">Quản lý danh sách nhân viên & ẩn/hiện trên lịch</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => setShowArchiveModal(true)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl transition-colors text-sm font-medium cursor-pointer shadow-sm"
          >
            <Calendar className="w-4 h-4 text-slate-600" />
            <span>Kho lưu trữ ngày (...)</span>
          </button>
          
          {role === 'Admin' && hiddenCount > 0 && (
            <button 
              onClick={handleUnhideAll}
              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3.5 py-2 rounded-xl transition-colors text-sm font-medium cursor-pointer shadow-sm"
              title="Bật hiển thị tất cả nhân viên lên lịch làm việc"
            >
              <Eye className="w-4 h-4 text-emerald-600" />
              <span>Hiện tất cả trên lịch ({hiddenCount})</span>
            </button>
          )}

          {role === 'Admin' && (
            <button 
              onClick={openAddForm}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer text-sm font-medium"
            >
              <UserPlus className="w-4 h-4" />
              <span>Thêm nhân viên</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm theo tên, mã NV, bộ phận..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
            />
          </div>
          
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium self-start md:self-auto">
            <button
              onClick={() => setFilterTab('all')}
              className={clsx(
                "px-3 py-1.5 rounded-lg transition-all cursor-pointer",
                filterTab === 'all' ? "bg-white text-slate-800 shadow-sm font-bold" : "text-slate-600 hover:text-slate-800"
              )}
            >
              Tất cả ({employees.length})
            </button>
            <button
              onClick={() => setFilterTab('visible')}
              className={clsx(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer",
                filterTab === 'visible' ? "bg-white text-emerald-700 shadow-sm font-bold" : "text-emerald-700 hover:text-emerald-800"
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Hiện trên lịch ({visibleCount})</span>
            </button>
            <button
              onClick={() => setFilterTab('hidden')}
              className={clsx(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer",
                filterTab === 'hidden' ? "bg-white text-rose-700 shadow-sm font-bold" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <EyeOff className="w-3.5 h-3.5 text-rose-500" />
              <span>Đã ẩn lịch ({hiddenCount})</span>
            </button>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold border-b border-slate-200">Mã NV</th>
                <th className="p-4 font-semibold border-b border-slate-200">Họ tên</th>
                <th className="p-4 font-semibold border-b border-slate-200">Bộ phận</th>
                <th className="p-4 font-semibold border-b border-slate-200">Chức vụ</th>
                <th className="p-4 font-semibold border-b border-slate-200">SĐT</th>
                <th className="p-4 font-semibold border-b border-slate-200">Ngày bắt đầu</th>
                <th className="p-4 font-semibold border-b border-slate-200">Ngày nghỉ việc</th>
                <th className="p-4 font-semibold border-b border-slate-200">Ẩn trên lịch</th>
                {role === 'Admin' && <th className="p-4 font-semibold border-b border-slate-200 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map(emp => {
                const isHidden = emp.is_hidden === 1 || emp.is_hidden === '1' || emp.is_hidden === true;
                const isPastEndDate = emp.end_date && new Date().toISOString().split('T')[0] > emp.end_date;

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-mono font-semibold text-slate-700">{emp.code}</td>
                    <td className="p-4 font-medium text-slate-800">{emp.name}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {emp.department}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600">{emp.role}</td>
                    <td className="p-4 text-slate-600 font-mono text-xs">{emp.phone || '—'}</td>
                    <td className="p-4 text-xs text-slate-600 italic">
                      {formatDate(emp.start_date) || 'Chưa cập nhật'}
                    </td>
                    <td className="p-4 text-xs">
                      {emp.end_date ? (
                        <span className={clsx("font-semibold", isPastEndDate ? "text-red-600" : "text-amber-600")}>
                          {formatDate(emp.end_date)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium">Đang làm việc</span>
                      )}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => toggleHide(emp.id)}
                        disabled={role !== 'Admin'}
                        title={role !== 'Admin' ? 'Chỉ Admin mới có quyền đổi' : 'Bấm để ẩn hoặc hiện trên lịch'}
                        className={clsx(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                          role === 'Admin' ? "cursor-pointer" : "cursor-default opacity-80",
                          !isHidden 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                            : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                        )}
                      >
                        <span className={clsx(
                          "w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px]",
                          !isHidden ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 bg-white"
                        )}>
                          {!isHidden && "✓"}
                        </span>
                        <span>{!isHidden ? 'Hiện trên lịch' : 'Đã ẩn lịch'}</span>
                      </button>
                    </td>
                    {role === 'Admin' && (
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button 
                            onClick={() => openEditForm(emp)} 
                            title="Sửa nhân viên"
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeleteConfirm({ id: emp.id, name: emp.name })} 
                            title="Xóa nhân viên"
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={role === 'Admin' ? 8 : 7} className="p-8 text-center text-slate-500">
                    Không tìm thấy nhân viên nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filtered.map(emp => {
          const status = getEmploymentStatus(emp);
          return (
            <div key={emp.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-bold text-slate-800 text-lg">{emp.name}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{emp.code}</div>
                </div>
                {role === 'Admin' && (
                  <div className="flex gap-1">
                    <button onClick={() => openEditForm(emp)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteConfirm({ id: emp.id, name: emp.name })} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2 text-xs mb-3">
                <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-medium border border-indigo-100">{emp.department}</span>
                <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">{emp.role}</span>
                {emp.phone && <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">{emp.phone}</span>}
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <div>
                    {emp.start_date && <span>Vào: <strong className="text-slate-800">{formatDate(emp.start_date)}</strong></span>}
                    {emp.end_date && <span className="ml-2 text-red-600">Nghỉ: <strong>{formatDate(emp.end_date)}</strong></span>}
                    {!emp.start_date && !emp.end_date && <span className="text-slate-400 italic">Chưa đặt ngày</span>}
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${status.color}`}>
                    {status.label}
                  </span>
                </div>
                
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => toggleHide(emp.id)}
                    disabled={role !== 'Admin'}
                    className={clsx(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                      role === 'Admin' ? "cursor-pointer" : "cursor-default opacity-80",
                      !emp.is_hidden 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    )}
                  >
                    <span className={clsx(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px]",
                      !emp.is_hidden ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 bg-white"
                    )}>
                      {!emp.is_hidden && "✓"}
                    </span>
                    <span>{!emp.is_hidden ? 'Hiện trên lịch' : 'Đã ẩn lịch'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center p-8 text-slate-500 bg-white rounded-2xl border border-slate-200">
            Không tìm thấy nhân viên nào.
          </div>
        )}
      </div>

      {/* Add/Edit Employee Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">
                {editingId ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mã NV <span className="text-red-500">*</span></label>
                  <input 
                    required 
                    type="text" 
                    value={formData.code} 
                    onChange={e => setFormData({...formData, code: e.target.value})} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" 
                    placeholder="VD: NV005" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Họ tên <span className="text-red-500">*</span></label>
                  <input 
                    required 
                    type="text" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" 
                    placeholder="Nguyễn Văn A" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Bộ phận</label>
                  <select 
                    value={formData.department} 
                    onChange={e => setFormData({...formData, department: e.target.value})} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  >
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Chức vụ</label>
                  <select 
                    value={formData.role} 
                    onChange={e => setFormData({...formData, role: e.target.value})} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
                <input 
                  type="text" 
                  value={formData.phone} 
                  onChange={e => setFormData({...formData, phone: e.target.value})} 
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" 
                  placeholder="0912345678"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Thời gian công tác (Lưu lên Google Sheets)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Ngày vào làm</label>
                    <input 
                      type="date" 
                      value={formData.start_date} 
                      onChange={e => setFormData({...formData, start_date: e.target.value})} 
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Ngày nghỉ việc</label>
                    <input 
                      type="date" 
                      value={formData.end_date} 
                      onChange={e => setFormData({...formData, end_date: e.target.value})} 
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" 
                    />
                    <span className="text-[11px] text-slate-400 mt-0.5 block">Để trống nếu đang làm việc</span>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)} 
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-sm font-medium"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer text-sm font-medium"
                >
                  {editingId ? 'Cập nhật' : 'Lưu nhân viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Xác nhận xóa</h3>
              <p className="text-slate-500 text-sm">
                Bạn có chắc muốn xóa nhân viên <strong className="text-slate-800">{deleteConfirm.name}</strong>? Toàn bộ lịch làm việc của nhân viên này cũng sẽ bị xóa vĩnh viễn.
              </p>
            </div>
            <div className="p-4 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirm(null)} 
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors font-medium cursor-pointer"
              >
                Hủy
              </button>
              <button 
                onClick={handleDelete} 
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm font-medium cursor-pointer"
              >
                Xóa nhân viên
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
