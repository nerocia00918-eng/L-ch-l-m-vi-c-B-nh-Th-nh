import { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle2, RefreshCw, Copy, Check, Code } from 'lucide-react';
import { Role } from '../App';
import clsx from 'clsx';

const APPS_SCRIPT_CODE = `function getSheetByNameCaseInsensitive(ss, name) {
  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}
  }
  if (!ss) return null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === name.toLowerCase()) {
      return sheets[i];
    }
  }
  return null;
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'No post data' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var params = JSON.parse(e.postData.contents);
    if (params.action === 'sync_all') {
      var data = params.data;
      
      updateSheet('Nhan_Vien', data.employees, ['id', 'code', 'name', 'department', 'role', 'phone', 'password', 'start_date', 'end_date', 'is_hidden']);
      updateSheet('DanhMuc_Ca', data.shifts, ['id', 'name', 'start_time', 'end_time', 'color', 'text_color']);
      updateSheet('Lich_Lam_Viec', data.schedules, ['id', 'date', 'employee_id', 'shift_id', 'task', 'status', 'note']);
      updateSheet('Thang_Chot', data.lockedMonths, ['month']);
      updateSheet('Thong_Bao', data.announcements, ['id', 'type', 'target_type', 'target_value', 'message', 'start_time', 'end_time', 'created_by', 'created_at']);
      updateSheet('Xac_Nhan_Thong_Bao', data.announcementViews, ['announcement_id', 'employee_id', 'viewed_at']);
      updateSheet('Don_Xin_Nghi', data.leaveRequests, ['id', 'employee_id', 'date', 'shift_id', 'reason', 'status', 'created_at']);
      updateSheet('DanhMuc_NhiemVu', data.tasks, ['id', 'department', 'name', 'color', 'text_color']);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function updateSheet(sheetName, items, columns) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  var sheet = getSheetByNameCaseInsensitive(ss, sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  sheet.clear();
  
  if (columns.length > 0) {
    sheet.appendRow(columns);
  }
  
  if (items && items.length > 0) {
    var rows = items.map(function(item) {
      return columns.map(function(col) {
        return item[col] !== undefined && item[col] !== null ? item[col].toString() : '';
      });
    });
    sheet.getRange(2, 1, rows.length, columns.length).setValues(rows);
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Spreadsheet not found' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var data = {
    employees: getSheetData(ss, 'Nhan_Vien', ['id', 'code', 'name', 'department', 'role', 'phone', 'password', 'start_date', 'end_date', 'is_hidden']),
    shifts: getSheetData(ss, 'DanhMuc_Ca', ['id', 'name', 'start_time', 'end_time', 'color', 'text_color']),
    schedules: getSheetData(ss, 'Lich_Lam_Viec', ['id', 'date', 'employee_id', 'shift_id', 'task', 'status', 'note']),
    lockedMonths: getSheetData(ss, 'Thang_Chot', ['month']),
    announcements: getSheetData(ss, 'Thong_Bao', ['id', 'type', 'target_type', 'target_value', 'message', 'start_time', 'end_time', 'created_by', 'created_at']),
    announcementViews: getSheetData(ss, 'Xac_Nhan_Thong_Bao', ['announcement_id', 'employee_id', 'viewed_at']),
    leaveRequests: getSheetData(ss, 'Don_Xin_Nghi', ['id', 'employee_id', 'date', 'shift_id', 'reason', 'status', 'created_at']),
    tasks: getSheetData(ss, 'DanhMuc_NhiemVu', ['id', 'department', 'name', 'color', 'text_color'])
  };
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function findColumnIndex(headers, colKey) {
  var cleanColKey = colKey.toLowerCase().replace(/[\\s_-]+/g, '');
  var aliases = [colKey, cleanColKey];
  
  if (colKey === 'start_date') {
    aliases = ['start_date', 'startdate', 'ngay_vao_lam', 'ngayvaolam', 'ngày vào làm', 'ngàyvàolàm', 'ngayvao', 'ngàyvào', 'start'];
  } else if (colKey === 'end_date') {
    aliases = ['end_date', 'enddate', 'ngay_nghi_viec', 'ngaynghiviec', 'ngày nghỉ việc', 'ngàynghỉviệc', 'ngaynghi', 'ngàynghỉ', 'end', 'quitdate'];
  } else if (colKey === 'is_hidden') {
    aliases = ['is_hidden', 'ishidden', 'an_lich', 'anlich', 'ẩn lịch', 'ẩn_lịch', 'an_tren_lich', 'hide', 'hidden'];
  } else if (colKey === 'department') {
    aliases = ['department', 'bophan', 'bộ phận', 'bộ_phận', 'phongban', 'phòng ban', 'phòng_ban', 'dept'];
  } else if (colKey === 'role') {
    aliases = ['role', 'chucvu', 'chức vụ', 'chức_vụ', 'vitri', 'vị trí', 'position'];
  } else if (colKey === 'code') {
    aliases = ['code', 'manv', 'mã nv', 'mã_nv', 'ma_nv', 'id_nhanvien'];
  } else if (colKey === 'name') {
    aliases = ['name', 'hoten', 'họ tên', 'họ_tên', 'ten', 'tên', 'fullname'];
  } else if (colKey === 'employee_id') {
    aliases = ['employee_id', 'employeeid', 'nhanvienid', 'idnhanvien', 'empid'];
  } else if (colKey === 'shift_id') {
    aliases = ['shift_id', 'shiftid', 'caid', 'idca'];
  }
  
  var normalizedHeaders = headers.map(function(h) { 
    return (h || '').toString().toLowerCase().trim().replace(/[\\s_-]+/g, ''); 
  });

  for (var i = 0; i < aliases.length; i++) {
    var target = aliases[i].toLowerCase().replace(/[\\s_-]+/g, '');
    var idx = normalizedHeaders.indexOf(target);
    if (idx !== -1) return idx;
  }
  return -1;
}

function getSheetData(ss, sheetName, columns) {
  var sheet = getSheetByNameCaseInsensitive(ss, sheetName);
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var rawHeaders = data[0];
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    var hasData = false;
    for (var j = 0; j < columns.length; j++) {
      var colKey = columns[j];
      var colIndex = findColumnIndex(rawHeaders, colKey);
      if (colIndex !== -1) {
        var val = row[colIndex];
        if (val !== undefined && val !== null && val !== '') {
          hasData = true;
          if (val instanceof Date) {
            try {
              val = Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
            } catch (e) {
              val = val.toISOString().split('T')[0];
            }
          }
          if (colKey === 'id' || colKey === 'employee_id' || colKey === 'shift_id' || colKey === 'created_by' || colKey === 'announcement_id') {
            obj[colKey] = (!isNaN(val)) ? Number(val) : val;
          } else {
            obj[colKey] = val.toString().trim();
          }
        } else {
          obj[colKey] = '';
        }
      } else {
        obj[colKey] = '';
      }
    }
    if (hasData) result.push(obj);
  }
  return result;
}`;

export default function Settings({ role, user }: { role: Role, user: any }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passStatus, setPassStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [passError, setPassError] = useState('');

  const [copiedCode, setCopiedCode] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const sheetUrl = data.find((s: any) => s.key === 'GOOGLE_SHEETS_URL');
        if (sheetUrl) setUrl(sheetUrl.value);
      });
  }, []);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'GOOGLE_SHEETS_URL', value: url.trim() })
      });
      
      if (res.ok) {
        setStatus('success');
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
    }
  };

  const handleSync = async () => {
    setSyncStatus('syncing');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (res.ok) {
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        setSyncStatus('error');
      }
    } catch (err) {
      setSyncStatus('error');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      setPassError('Mật khẩu không khớp hoặc để trống!');
      return;
    }
    setPassError('');
    setPassStatus('saving');
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: user.id, new_password: newPassword })
      });
      if (res.ok) {
        setPassStatus('success');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPassStatus('idle'), 3000);
      } else {
        setPassStatus('error');
      }
    } catch (err) {
      setPassStatus('error');
    }
  };

  if (role !== 'Admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500">Bạn không có quyền truy cập trang này.</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Kết nối Google Sheets</h2>
            <p className="text-sm text-slate-500">
              Dán đường link Web App URL từ Google Apps Script vào đây để đồng bộ dữ liệu tự động 2 chiều.
            </p>
          </div>
          <button 
            onClick={handleSync}
            disabled={syncStatus === 'syncing' || !url}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={clsx("w-4 h-4", syncStatus === 'syncing' && "animate-spin")} />
            {syncStatus === 'syncing' ? 'Đang tải...' : 'Tải dữ liệu từ Sheet'}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Web App URL</label>
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {status === 'success' && <span className="text-green-600 flex items-center gap-1 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Đã lưu thành công!</span>}
              {status === 'error' && <span className="text-red-600 flex items-center gap-1 text-sm font-medium"><AlertCircle className="w-4 h-4" /> Có lỗi xảy ra khi lưu.</span>}
              {syncStatus === 'success' && <span className="text-green-600 flex items-center gap-1 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Đồng bộ dữ liệu thành công!</span>}
              {syncStatus === 'error' && <span className="text-red-600 flex items-center gap-1 text-sm font-medium"><AlertCircle className="w-4 h-4" /> Lỗi khi tải dữ liệu từ Sheet.</span>}
            </div>
            <button 
              onClick={handleSave}
              disabled={status === 'saving'}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {status === 'saving' ? 'Đang lưu...' : 'Lưu cài đặt'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Đổi mật khẩu Admin</h2>
        <p className="text-sm text-slate-500 mb-6">Thay đổi mật khẩu đăng nhập cho tài khoản Admin hiện tại.</p>
        
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu mới</label>
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Xác nhận mật khẩu</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          
          {passError && <p className="text-red-500 text-sm">{passError}</p>}
          
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {passStatus === 'success' && <span className="text-green-600 flex items-center gap-1 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Đã đổi thành công!</span>}
              {passStatus === 'error' && <span className="text-red-600 flex items-center gap-1 text-sm font-medium"><AlertCircle className="w-4 h-4" /> Lỗi khi đổi mật khẩu.</span>}
            </div>
            <button 
              onClick={handleChangePassword}
              disabled={passStatus === 'saving'}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cập nhật mật khẩu
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Mã Google Apps Script mới nhất</h3>
            <p className="text-xs text-slate-500">Đã cập nhật lưu ngày vào làm (start_date) & ngày nghỉ việc (end_date).</p>
          </div>
          <button 
            onClick={handleCopyCode}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer self-start sm:self-auto"
          >
            {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedCode ? 'Đã sao chép!' : 'Sao chép mã Apps Script'}
          </button>
        </div>

        <div className="text-xs text-slate-600 bg-white p-4 rounded-xl border border-slate-200 space-y-2">
          <div className="font-semibold text-slate-800">Các cột của trang tính "Nhan_Vien":</div>
          <div className="font-mono text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 overflow-x-auto text-[11px]">
            id | code | name | department | role | phone | password | start_date | end_date
          </div>
          <p className="text-slate-500">
            * Ứng dụng tự động nhận diện cột kể cả khi bạn đặt tên là <code>start_date</code>, <code>ngay_vao_lam</code> hay <code>ngày vào làm</code>, <code>end_date</code> hay <code>ngày nghỉ việc</code>.
          </p>
        </div>

        <div>
          <button 
            onClick={() => setShowCode(!showCode)} 
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
          >
            <Code className="w-3.5 h-3.5" />
            {showCode ? 'Ẩn mã Apps Script' : 'Xem toàn bộ mã Apps Script'}
          </button>
          {showCode && (
            <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-xl text-xs overflow-x-auto max-h-64 font-mono">
              {APPS_SCRIPT_CODE}
            </pre>
          )}
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h4 className="font-bold text-slate-800 text-sm mb-2">Các bước cập nhật trên Google Sheets:</h4>
          <ol className="list-decimal list-inside space-y-2 text-xs text-slate-600">
            <li>Mở file Google Sheets &gt; Vào <strong>Tiện ích mở rộng</strong> &gt; <strong>Apps Script</strong>.</li>
            <li>Xóa mã cũ trong file <code className="bg-white px-1 py-0.5 rounded border border-slate-200">Mã.gs</code>, dán toàn bộ mã mới đã sao chép ở trên vào và bấm <strong>Lưu (Ctrl + S)</strong>.</li>
            <li>Bấm <strong>Triển khai (Deploy)</strong> &gt; <strong>Quản lý công tác triển khai (Manage deployments)</strong>.</li>
            <li>Bấm biểu tượng cây bút (Chỉnh sửa), chọn Phiên bản: <strong>Phiên bản mới (New version)</strong>.</li>
            <li>Đảm bảo: Thực thi dưới tư cách: <strong>Tôi (Me)</strong> và Quyền truy cập: <strong>Bất kỳ ai (Anyone)</strong> &gt; Bấm <strong>Triển khai (Deploy)</strong>.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
