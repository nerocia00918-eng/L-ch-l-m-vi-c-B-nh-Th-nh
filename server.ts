import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const db = new Database('schedule.db');

const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;

function getGoogleSheetsUrl() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('GOOGLE_SHEETS_URL') as { value: string } | undefined;
    return row ? row.value : process.env.GOOGLE_SHEETS_URL;
  } catch (e) {
    return process.env.GOOGLE_SHEETS_URL;
  }
}

let syncTimeout: NodeJS.Timeout | null = null;
function triggerSync() {
  const url = getGoogleSheetsUrl();
  if (!url) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      const employees = db.prepare('SELECT * FROM employees').all();
      const shifts = db.prepare('SELECT * FROM shifts').all();
      const schedules = db.prepare('SELECT * FROM schedules').all();
      const lockedMonths = db.prepare('SELECT * FROM locked_months').all();
      const announcements = db.prepare('SELECT * FROM announcements').all();
      const announcementViews = db.prepare('SELECT * FROM announcement_views').all();
      const leaveRequests = db.prepare('SELECT * FROM leave_requests').all();
      const tasks = db.prepare('SELECT * FROM tasks').all();

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'sync_all',
          data: { employees, shifts, schedules, lockedMonths, announcements, announcementViews, leaveRequests, tasks }
        }),
        redirect: 'follow'
      });
      
      const text = await res.text();
      try {
        const result = JSON.parse(text);
        if (result.success) {
          console.log('Synced to Google Sheets successfully');
        } else {
          console.error('Google Sheets sync error:', result.error);
        }
      } catch (e) {
        console.error('\n=============================================================');
        console.error('❌ LỖI ĐỒNG BỘ GOOGLE SHEETS: Phản hồi không phải là JSON hợp lệ.');
        console.error('Nội dung phản hồi (trích đoạn):', text.substring(0, 200) + '...');
        console.error('👉 CÁCH KHẮC PHỤC:');
        console.error('1. Mở lại Google Apps Script.');
        console.error('2. Bấm "Triển khai" (Deploy) -> "Quản lý công tác triển khai" (Manage deployments).');
        console.error('3. Bấm biểu tượng cây bút (Chỉnh sửa) ở góc phải.');
        console.error('4. Đảm bảo 2 cài đặt sau CHÍNH XÁC:');
        console.error('   - Thực thi dưới tư cách (Execute as): CHỌN "Tôi" (Me)');
        console.error('   - Quyền truy cập (Who has access): CHỌN "Bất kỳ ai" (Anyone)');
        console.error('5. Bấm "Triển khai" (Deploy) lại và copy link mới (phải có đuôi /exec).');
        console.error('6. Dán link mới vào mục Cài đặt trong ứng dụng.');
        console.error('=============================================================\n');
      }
    } catch (err) {
      console.error('Failed to sync to Google Sheets:', err);
    }
  }, 2000);
}

function normalizeDepartmentServer(dept?: string): string {
  if (!dept) return 'Quản lý';
  const d = String(dept)
    .trim()
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u00A0\s]+/g, ' ')
    .replace(/^(ban|bộ phận|khối|phòng|tổ|đội|bp\.?)\s+/gi, '')
    .trim();

  if (
    d.includes('quản') ||
    d.includes('admin') ||
    d.includes('giám đốc') ||
    d.includes('giam doc') ||
    d.includes('điều hành') ||
    d.includes('dieu hanh') ||
    d.includes('bql') ||
    d.includes('management') ||
    d.includes('manager') ||
    d === 'ql' ||
    /(^|\s)ql($|\s)/i.test(d)
  ) {
    return 'Quản lý';
  }

  if (d.includes('bán hàng') || d.includes('ban hang') || d === 'sale' || d === 'sales') return 'Bán hàng';
  if (d.includes('thu ngân') || d.includes('thu ngan') || d === 'cashier') return 'Thu ngân';
  if (d.includes('kỹ thuật') || d.includes('ky thuat') || d === 'it') return 'Kỹ thuật';
  if (d.includes('kho') || d.includes('kho vận') || d.includes('kho van')) return 'Kho';
  if (d.includes('giao vận') || d.includes('giao van') || d.includes('shipper') || d.includes('giao hàng') || d.includes('giao hang')) return 'Giao vận';

  return String(dept).trim();
}

async function loadFromGoogleSheets() {
  const url = getGoogleSheetsUrl();
  if (!url) return;
  try {
    console.log('Fetching data from Google Sheets...');
    const res = await fetch(url);
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('\n=============================================================');
      console.error('❌ LỖI KẾT NỐI GOOGLE SHEETS: URL trả về HTML thay vì JSON.');
      console.error('Lỗi này xảy ra do cài đặt phân quyền lúc Deploy chưa chính xác.');
      console.error('👉 CÁCH KHẮC PHỤC:');
      console.error('1. Mở lại Google Apps Script.');
      console.error('2. Bấm "Triển khai" (Deploy) -> "Quản lý công tác triển khai" (Manage deployments).');
      console.error('3. Bấm biểu tượng cây bút (Chỉnh sửa) ở góc phải.');
      console.error('4. Đảm bảo 2 cài đặt sau CHÍNH XÁC:');
      console.error('   - Thực thi dưới tư cách (Execute as): CHỌN "Tôi" (Me)');
      console.error('   - Quyền truy cập (Who has access): CHỌN "Bất kỳ ai" (Anyone)');
      console.error('5. Bấm "Triển khai" (Deploy) lại và copy link mới (phải có đuôi /exec).');
      console.error('=============================================================\n');
      return;
    }

    if (data && data.employees) {
      db.transaction(() => {
        db.prepare('DELETE FROM employees').run();
        db.prepare('DELETE FROM shifts').run();
        db.prepare('DELETE FROM schedules').run();
        db.prepare('DELETE FROM locked_months').run();
        db.prepare('DELETE FROM announcements').run();
        db.prepare('DELETE FROM leave_requests').run();
        db.prepare('DELETE FROM tasks').run();

        if (data.employees.length > 0) {
          const insertEmp = db.prepare('INSERT INTO employees (id, code, name, department, role, phone, password, start_date, end_date, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          let hasAdmin = false;
          data.employees.forEach((e: any) => {
            let role = e.role || 'Nhân viên';
            if (role.toLowerCase() === 'admin') {
              role = 'Admin';
              hasAdmin = true;
            }
            else if (role.toLowerCase() === 'tổ trưởng') role = 'Tổ trưởng';
            else if (role.toLowerCase() === 'nhân viên') role = 'Nhân viên';
            
            let password = e.password || '';
            if (role === 'Admin' && !password) {
              password = '1234';
            }
            
            const startDate = e.start_date ? String(e.start_date).trim() : '';
            const endDate = e.end_date ? String(e.end_date).trim() : '';
            
            let dept = normalizeDepartmentServer(e.department);

            let isHidden = (e.is_hidden === 1 || e.is_hidden === '1' || e.is_hidden === true || String(e.is_hidden).toLowerCase() === 'true' || String(e.is_hidden).toLowerCase() === 'ẩn') ? 1 : 0;
            // Safeguard: Quản lý and Admin department must NEVER be hidden on schedule
            if (role === 'Admin' || dept === 'Quản lý') {
              isHidden = 0;
            }
            
            insertEmp.run(e.id, String(e.code || '').trim(), String(e.name || '').trim(), dept, role, e.phone || '', password, startDate, endDate, isHidden);
          });
          
          if (!hasAdmin) {
            const insertDefaultAdmin = db.prepare('INSERT INTO employees (code, name, department, role, phone, password, start_date, end_date, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            insertDefaultAdmin.run('ADMIN', 'Quản trị viên', 'Quản lý', 'Admin', '0999999999', '1234', '', '', 0);
          }
        } else {
          const insertDefaultAdmin = db.prepare('INSERT INTO employees (code, name, department, role, phone, password, start_date, end_date, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
          insertDefaultAdmin.run('ADMIN', 'Quản trị viên', 'Quản lý', 'Admin', '0999999999', '1234', '', '', 0);
        }

        if (data.shifts && data.shifts.length > 0) {
          const insertShift = db.prepare('INSERT INTO shifts (id, name, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?, ?)');
          data.shifts.forEach((s: any) => insertShift.run(s.id, s.name, s.start_time, s.end_time, s.color, s.text_color));
        }

        if (data.schedules && data.schedules.length > 0) {
          const insertSched = db.prepare('INSERT INTO schedules (id, date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
          data.schedules.forEach((s: any) => insertSched.run(s.id, s.date, s.employee_id, s.shift_id, s.task, s.status, s.note));
        }

        if (data.lockedMonths && data.lockedMonths.length > 0) {
          const insertLock = db.prepare('INSERT INTO locked_months (month) VALUES (?)');
          data.lockedMonths.forEach((l: any) => insertLock.run(l.month));
        }

        if (data.announcements && data.announcements.length > 0) {
          const insertAnn = db.prepare('INSERT INTO announcements (id, type, target_type, target_value, message, start_time, end_time, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
          data.announcements.forEach((a: any) => insertAnn.run(a.id, a.type, a.target_type, a.target_value, a.message, a.start_time, a.end_time, a.created_by, a.created_at));
        }

        db.prepare('DELETE FROM announcement_views').run();
        if (data.announcementViews && data.announcementViews.length > 0) {
          const insertView = db.prepare('INSERT INTO announcement_views (announcement_id, employee_id, viewed_at) VALUES (?, ?, ?)');
          data.announcementViews.forEach((v: any) => insertView.run(v.announcement_id, v.employee_id, v.viewed_at));
        }

        if (data.leaveRequests && data.leaveRequests.length > 0) {
          const insertLeave = db.prepare('INSERT INTO leave_requests (id, employee_id, date, shift_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
          data.leaveRequests.forEach((l: any) => insertLeave.run(l.id, l.employee_id, l.date, l.shift_id, l.reason, l.status, l.created_at));
        }

        if (data.tasks && data.tasks.length > 0) {
          const insertTask = db.prepare('INSERT INTO tasks (id, department, name, color, text_color) VALUES (?, ?, ?, ?, ?)');
          data.tasks.forEach((t: any) => insertTask.run(t.id, t.department, t.name, t.color, t.text_color));
        }
      })();
      console.log('Successfully loaded data from Google Sheets');
    }
  } catch (err) {
    console.error('Failed to load from Google Sheets:', err);
  }
}

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    name TEXT,
    department TEXT,
    role TEXT,
    phone TEXT
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    start_time TEXT,
    end_time TEXT,
    color TEXT,
    text_color TEXT
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    employee_id INTEGER,
    shift_id INTEGER,
    task TEXT,
    status TEXT,
    FOREIGN KEY(employee_id) REFERENCES employees(id),
    FOREIGN KEY(shift_id) REFERENCES shifts(id)
  );

  CREATE TABLE IF NOT EXISTS locked_months (
    month TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT, -- 'Highlight 1' (Admin), 'Highlight 2' (Tổ trưởng)
    target_type TEXT, -- 'All', 'Department', 'Individual'
    target_value TEXT, -- Department name or Employee ID
    message TEXT,
    start_time TEXT,
    end_time TEXT,
    created_by INTEGER,
    created_at TEXT,
    FOREIGN KEY(created_by) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS announcement_views (
    announcement_id INTEGER,
    employee_id INTEGER,
    viewed_at TEXT,
    PRIMARY KEY(announcement_id, employee_id),
    FOREIGN KEY(announcement_id) REFERENCES announcements(id),
    FOREIGN KEY(employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    date TEXT,
    shift_id INTEGER,
    reason TEXT,
    status TEXT,
    created_at TEXT,
    FOREIGN KEY(employee_id) REFERENCES employees(id),
    FOREIGN KEY(shift_id) REFERENCES shifts(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department TEXT,
    name TEXT,
    color TEXT,
    text_color TEXT
  );
`);

// Add password, start_date, end_date and is_hidden columns to employees if not exists
try {
  db.exec('ALTER TABLE employees ADD COLUMN password TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE employees ADD COLUMN start_date TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE employees ADD COLUMN end_date TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE employees ADD COLUMN is_hidden INTEGER DEFAULT 0');
} catch (e) {}

// Always ensure all Management / Admin employees are NEVER hidden
try {
  db.exec("UPDATE employees SET is_hidden = 0 WHERE role = 'Admin' OR department LIKE '%Quản%' OR department LIKE '%Admin%' OR department LIKE '%QL%' OR department LIKE '%Giám đốc%'");
} catch (e) {}

// Add start_time and end_time to announcements if not exists
try {
  db.exec('ALTER TABLE announcements ADD COLUMN start_time TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN end_time TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN type TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN target_type TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN target_value TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN created_by INTEGER');
} catch (e) {}
try {
  db.exec('ALTER TABLE announcements ADD COLUMN created_at TEXT');
} catch (e) {}

// Set default password for existing admins
db.prepare("UPDATE employees SET password = ? WHERE role = 'Admin' AND (password IS NULL OR password = '')").run('1234');

// Seed initial tasks if empty
const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number };
if (taskCount.count === 0) {
  const insertTask = db.prepare('INSERT INTO tasks (department, name, color, text_color) VALUES (?, ?, ?, ?)');
  // Default tasks for Bán hàng
  insertTask.run('Bán hàng', 'Trực cửa', '#4c1d95', '#ffffff');
  insertTask.run('Bán hàng', 'Hotline', '#16a34a', '#ffffff');
  insertTask.run('Bán hàng', 'Vệ sinh', '#2dd4bf', '#064e3b');
}

try {
  db.exec('ALTER TABLE schedules ADD COLUMN note TEXT');
} catch (e) {
  // Ignore if column already exists
}

// Migrate OFF shift to 3 types of OFF
try {
  const offShift = db.prepare('SELECT id FROM shifts WHERE name = ?').get('OFF');
  if (offShift) {
    db.prepare('UPDATE shifts SET name = ? WHERE name = ?').run('OFF tuần', 'OFF');
    db.prepare('INSERT INTO shifts (name, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?)').run('OFF phép', '00:00', '23:59', '#fef08a', '#854d0e');
    db.prepare('INSERT INTO shifts (name, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?)').run('OFF không lương', '00:00', '23:59', '#fef08a', '#854d0e');
  }
} catch (e) {
  // Ignore
}

// Seed initial data if empty
const employeeCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
if (employeeCount.count === 0) {
  const insertEmployee = db.prepare('INSERT INTO employees (code, name, department, role, phone, password) VALUES (?, ?, ?, ?, ?, ?)');
  insertEmployee.run('ADMIN', 'Quản trị viên', 'Quản lý', 'Admin', '0999999999', '1234');
  
  const insertEmployeeNoPass = db.prepare('INSERT INTO employees (code, name, department, role, phone) VALUES (?, ?, ?, ?, ?)');
  insertEmployeeNoPass.run('NV001', 'Nguyễn Văn A', 'Bán hàng', 'Nhân viên', '0123456789');
  insertEmployeeNoPass.run('NV002', 'Trần Thị B', 'Quản lý', 'Tổ trưởng', '0987654321');
  insertEmployeeNoPass.run('NV003', 'Lê Văn C', 'Kỹ thuật', 'Nhân viên', '0111222333');
  insertEmployeeNoPass.run('NV004', 'Phạm Thị D', 'Thu ngân', 'Nhân viên', '0444555666');

  const insertShift = db.prepare('INSERT INTO shifts (name, start_time, end_time, color, text_color) VALUES (?, ?, ?, ?, ?)');
  insertShift.run('SÁNG', '08:30', '17:30', '#e0f2fe', '#0369a1');
  insertShift.run('CHIỀU', '13:30', '21:00', '#ffedd5', '#c2410c');
  insertShift.run('LỠ', '10:00', '19:00', '#d6c4b5', '#4a3b32'); 
  insertShift.run('OFF TUẦN', '00:00', '23:59', '#fef08a', '#854d0e'); 
  insertShift.run('OFF PHÉP', '00:00', '23:59', '#fef08a', '#854d0e'); 
  insertShift.run('OFF KHÔNG LƯƠNG', '00:00', '23:59', '#fef08a', '#854d0e'); 
  insertShift.run('TĂNG CA', '08:30', '21:00', '#ef4444', '#ffffff'); 
}

async function startServer() {
  await loadFromGoogleSheets();

  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  app.use(express.json());

  // API Routes
  app.get('/api/employees', (req, res) => {
    const employees = db.prepare('SELECT * FROM employees').all() as any[];
    // Ensure Quản lý & Admin department are always unhidden and cleanly named
    const sanitized = employees.map(emp => {
      const d = (emp.department || '').trim().toLowerCase();
      const isMgmt = emp.role === 'Admin' || d.includes('quản') || d.includes('admin') || d.includes('ql') || d.includes('giám đốc') || d.includes('management');
      return {
        ...emp,
        department: isMgmt ? 'Quản lý' : (emp.department || 'Bán hàng'),
        is_hidden: isMgmt ? 0 : (emp.is_hidden === 1 || emp.is_hidden === '1' || emp.is_hidden === true ? 1 : 0)
      };
    });
    res.json(sanitized);
  });

  app.post('/api/employees', (req, res) => {
    const { code, name, department, role, phone, start_date, end_date, is_hidden } = req.body;
    try {
      const dept = normalizeDepartmentServer(department);
      const isMgmt = role === 'Admin' || dept === 'Quản lý';
      const hiddenVal = isMgmt ? 0 : (is_hidden ? 1 : 0);

      const result = db.prepare('INSERT INTO employees (code, name, department, role, phone, start_date, end_date, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(String(code || '').trim(), String(name || '').trim(), dept, role || 'Nhân viên', phone || '', start_date || '', end_date || '', hiddenVal);
      const newEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
      io.emit('employees:updated');
      triggerSync();
      res.json(newEmployee);
    } catch (error) {
      res.status(400).json({ error: 'Mã nhân viên đã tồn tại hoặc lỗi dữ liệu' });
    }
  });

  app.put('/api/employees/:id', (req, res) => {
    const { code, name, department, role, phone, start_date, end_date, is_hidden } = req.body;
    try {
      const dept = normalizeDepartmentServer(department);
      const isMgmt = role === 'Admin' || dept === 'Quản lý';
      const hiddenVal = isMgmt ? 0 : (is_hidden ? 1 : 0);

      db.prepare('UPDATE employees SET code = ?, name = ?, department = ?, role = ?, phone = ?, start_date = ?, end_date = ?, is_hidden = ? WHERE id = ?')
        .run(String(code || '').trim(), String(name || '').trim(), dept, role || 'Nhân viên', phone || '', start_date || '', end_date || '', hiddenVal, req.params.id);
      io.emit('employees:updated');
      io.emit('schedules:updated');
      triggerSync();
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: 'Mã nhân viên đã tồn tại hoặc lỗi dữ liệu' });
    }
  });

  app.patch('/api/employees/:id/toggle-hide', (req, res) => {
    try {
      const emp = db.prepare('SELECT id, role, department, is_hidden FROM employees WHERE id = ?').get(req.params.id) as any;
      if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
      
      const d = (emp.department || '').toLowerCase();
      const isMgmt = emp.role === 'Admin' || d.includes('quản') || d.includes('admin') || d.includes('ql') || d.includes('giám đốc');
      if (isMgmt) {
        // Management employees can never be hidden
        db.prepare('UPDATE employees SET is_hidden = 0 WHERE id = ?').run(req.params.id);
        io.emit('employees:updated');
        io.emit('schedules:updated');
        return res.json({ success: true, is_hidden: 0 });
      }

      const newHidden = emp.is_hidden === 1 ? 0 : 1;
      db.prepare('UPDATE employees SET is_hidden = ? WHERE id = ?').run(newHidden, req.params.id);
      io.emit('employees:updated');
      io.emit('schedules:updated');
      triggerSync();
      res.json({ success: true, is_hidden: newHidden });
    } catch (error) {
      res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái ẩn lịch' });
    }
  });

  app.post('/api/employees/unhide-all', (req, res) => {
    try {
      db.prepare('UPDATE employees SET is_hidden = 0').run();
      io.emit('employees:updated');
      io.emit('schedules:updated');
      triggerSync();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/employees/:id', (req, res) => {
    try {
      const deleteEmp = db.transaction(() => {
        db.prepare('DELETE FROM schedules WHERE employee_id = ?').run(req.params.id);
        db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
      });
      deleteEmp();
      io.emit('employees:updated');
      io.emit('schedules:updated');
      triggerSync();
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ error: 'Lỗi khi xóa nhân viên' });
    }
  });

  app.get('/api/shifts', (req, res) => {
    const shifts = db.prepare('SELECT * FROM shifts').all();
    res.json(shifts);
  });

  app.get('/api/schedules', (req, res) => {
    const { start, end } = req.query;
    const schedules = db.prepare(`
      SELECT s.*, e.name as employee_name, e.department, sh.name as shift_name, sh.start_time, sh.end_time, sh.color, sh.text_color
      FROM schedules s
      JOIN employees e ON s.employee_id = e.id
      JOIN shifts sh ON s.shift_id = sh.id
      WHERE s.date >= ? AND s.date <= ?
    `).all(start, end);
    res.json(schedules);
  });

  app.post('/api/schedules', (req, res) => {
    const { date, employee_id, shift_id, task, status, note } = req.body;
    
    // Check locked month
    const month = date.substring(0, 7);
    const isLocked = db.prepare('SELECT * FROM locked_months WHERE month = ?').get(month);
    if (isLocked) {
      return res.status(403).json({ error: 'Tháng này đã khóa lịch, không thể sửa' });
    }

    const existing = db.prepare('SELECT id FROM schedules WHERE date = ? AND employee_id = ?').get(date, employee_id) as { id: number };
    
    if (existing) {
      db.prepare('UPDATE schedules SET shift_id = ?, task = ?, status = ?, note = ? WHERE id = ?')
        .run(shift_id, task, status, note || '', existing.id);
    } else {
      db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)')
        .run(date, employee_id, shift_id, task, status, note || '');
    }

    io.emit('schedules:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.delete('/api/schedules/:id', (req, res) => {
    db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);

    io.emit('schedules:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/schedules/copy-week', (req, res) => {
    const { fromStartDate, toStartDate } = req.body;
    const fromDateObj = new Date(fromStartDate);
    const toDateObj = new Date(toStartDate);
    
    const diffTime = toDateObj.getTime() - fromDateObj.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    const schedulesToCopy = db.prepare(`
      SELECT * FROM schedules 
      WHERE date >= ? AND date <= date(?, '+6 days')
    `).all(fromStartDate, fromStartDate) as any[];

    const insertStmt = db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)');
    const checkStmt = db.prepare('SELECT id FROM schedules WHERE date = ? AND employee_id = ?');
    const updateStmt = db.prepare('UPDATE schedules SET shift_id = ?, task = ?, status = ?, note = ? WHERE id = ?');

    const transaction = db.transaction((schedules) => {
      for (const s of schedules) {
        const oldDate = new Date(s.date);
        const newDate = new Date(oldDate.getTime() + diffDays * 24 * 60 * 60 * 1000);
        const newDateStr = newDate.toISOString().split('T')[0];
        
        const existing = checkStmt.get(newDateStr, s.employee_id) as any;
        if (existing) {
          updateStmt.run(s.shift_id, s.task, s.status, s.note || '', existing.id);
        } else {
          insertStmt.run(newDateStr, s.employee_id, s.shift_id, s.task, s.status, s.note || '');
        }
      }
    });

    transaction(schedulesToCopy);
    io.emit('schedules:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.get('/api/announcements', (req, res) => {
    const { employee_id, department } = req.query;
    const now = new Date().toISOString();
    
    let announcements;
    if (employee_id) {
      // Get active announcements for a specific employee
      announcements = db.prepare(`
        SELECT a.*, e.name as creator_name, v.viewed_at
        FROM announcements a
        JOIN employees e ON a.created_by = e.id
        LEFT JOIN announcement_views v ON a.id = v.announcement_id AND v.employee_id = ?
        WHERE (a.start_time <= ? AND a.end_time >= ?)
        AND (
          a.target_type = 'All' 
          OR (a.target_type = 'Department' AND (',' || a.target_value || ',') LIKE ('%,' || ? || ',%'))
          OR (a.target_type = 'Individual' AND (',' || a.target_value || ',') LIKE ('%,' || ? || ',%'))
        )
      `).all(employee_id, now, now, department, employee_id);
    } else {
      // Admin/TL view all relevant announcements
      announcements = db.prepare(`
        SELECT a.*, e.name as creator_name
        FROM announcements a
        JOIN employees e ON a.created_by = e.id
        ORDER BY a.created_at DESC
      `).all();
    }
    res.json(announcements);
  });

  app.post('/api/announcements', (req, res) => {
    const { type, target_type, target_value, message, start_time, end_time, created_by } = req.body;
    const created_at = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO announcements (type, target_type, target_value, message, start_time, end_time, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(type, target_type, target_value, message, start_time, end_time, created_by, created_at);
    
    io.emit('announcements:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.put('/api/announcements/:id', (req, res) => {
    const { type, target_type, target_value, message, start_time, end_time } = req.body;
    db.prepare(`
      UPDATE announcements 
      SET type = ?, target_type = ?, target_value = ?, message = ?, start_time = ?, end_time = ?
      WHERE id = ?
    `).run(type, target_type, target_value, message, start_time, end_time, req.params.id);
    
    io.emit('announcements:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/announcements/:id/view', (req, res) => {
    const { employee_id } = req.body;
    const viewed_at = new Date().toISOString();
    db.prepare('INSERT OR IGNORE INTO announcement_views (announcement_id, employee_id, viewed_at) VALUES (?, ?, ?)')
      .run(req.params.id, employee_id, viewed_at);
    res.json({ success: true });
  });

  app.get('/api/announcements/:id/views', (req, res) => {
    const views = db.prepare(`
      SELECT e.id, e.name, e.code, e.department, v.viewed_at
      FROM employees e
      LEFT JOIN announcement_views v ON e.id = v.employee_id AND v.announcement_id = ?
      WHERE e.role != 'Guest'
    `).all(req.params.id);
    res.json(views);
  });

  app.delete('/api/announcements/:id', (req, res) => {
    db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
    io.emit('announcements:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.get('/api/leave-requests', (req, res) => {
    const requests = db.prepare(`
      SELECT lr.*, e.name as employee_name, e.department, s.name as shift_name 
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN shifts s ON lr.shift_id = s.id
      ORDER BY lr.created_at DESC
    `).all();
    res.json(requests);
  });

  app.post('/api/leave-requests', (req, res) => {
    const { employee_id, date, shift_id, reason } = req.body;
    const created_at = new Date().toISOString();
    db.prepare('INSERT INTO leave_requests (employee_id, date, shift_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(employee_id, date, shift_id, reason, 'Chờ duyệt', created_at);
    io.emit('leave_requests:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.put('/api/leave-requests/:id/status', (req, res) => {
    const { status } = req.body;
    const id = req.params.id;
    db.prepare('UPDATE leave_requests SET status = ? WHERE id = ?').run(status, id);
    
    if (status === 'Đã duyệt') {
      const reqData = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as any;
      if (reqData) {
        const existing = db.prepare('SELECT id FROM schedules WHERE date = ? AND employee_id = ?').get(reqData.date, reqData.employee_id) as any;
        if (existing) {
          db.prepare('UPDATE schedules SET shift_id = ?, task = ?, status = ?, note = ? WHERE id = ?')
            .run(reqData.shift_id, 'Không', 'Published', 'Nghỉ phép đã duyệt', existing.id);
        } else {
          db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)')
            .run(reqData.date, reqData.employee_id, reqData.shift_id, 'Không', 'Published', 'Nghỉ phép đã duyệt');
        }
        io.emit('schedules:updated');
      }
    }
    
    io.emit('leave_requests:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/schedules/bulk', (req, res) => {
    const { schedules } = req.body;
    const insertStmt = db.prepare('INSERT INTO schedules (date, employee_id, shift_id, task, status, note) VALUES (?, ?, ?, ?, ?, ?)');
    const updateStmt = db.prepare('UPDATE schedules SET shift_id = ?, task = ?, status = ?, note = ? WHERE id = ?');
    const checkStmt = db.prepare('SELECT id FROM schedules WHERE date = ? AND employee_id = ?');

    const transaction = db.transaction((scheds) => {
      for (const s of scheds) {
        const existing = checkStmt.get(s.date, s.employee_id) as any;
        if (existing) {
          updateStmt.run(s.shift_id, s.task, s.status, s.note || '', existing.id);
        } else {
          insertStmt.run(s.date, s.employee_id, s.shift_id, s.task, s.status, s.note || '');
        }
      }
    });

    transaction(schedules);
    io.emit('schedules:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/sync', async (req, res) => {
    try {
      await loadFromGoogleSheets();
      io.emit('employees:updated');
      io.emit('schedules:updated');
      io.emit('settings:updated');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Lỗi đồng bộ dữ liệu' });
    }
  });

  app.get('/api/locked-months', (req, res) => {
    const months = db.prepare('SELECT month FROM locked_months').all().map((m: any) => m.month);
    res.json(months);
  });

  app.post('/api/locked-months', (req, res) => {
    const { month, locked } = req.body;
    if (locked) {
      db.prepare('INSERT OR IGNORE INTO locked_months (month) VALUES (?)').run(month);
    } else {
      db.prepare('DELETE FROM locked_months WHERE month = ?').run(month);
    }
    io.emit('settings:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.get('/api/settings', (req, res) => {
    const settings = db.prepare('SELECT * FROM settings').all();
    res.json(settings);
  });

  app.post('/api/settings', (req, res) => {
    const { key, value } = req.body;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    if (key === 'GOOGLE_SHEETS_URL' && value) {
      loadFromGoogleSheets();
    }
    res.json({ success: true });
  });

  app.get('/api/tasks', (req, res) => {
    const { department } = req.query;
    let tasks;
    if (department && department !== 'All') {
      tasks = db.prepare('SELECT * FROM tasks WHERE department = ? OR department = "All"').all(department);
    } else {
      tasks = db.prepare('SELECT * FROM tasks').all();
    }
    res.json(tasks);
  });

  app.post('/api/tasks', (req, res) => {
    const { department, name, color, text_color } = req.body;
    db.prepare('INSERT INTO tasks (department, name, color, text_color) VALUES (?, ?, ?, ?)')
      .run(department, name, color, text_color);
    io.emit('tasks:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.delete('/api/tasks/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    io.emit('tasks:updated');
    triggerSync();
    res.json({ success: true });
  });

  app.post('/api/change-password', (req, res) => {
    const { employee_id, new_password } = req.body;
    db.prepare('UPDATE employees SET password = ? WHERE id = ?').run(new_password, employee_id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
