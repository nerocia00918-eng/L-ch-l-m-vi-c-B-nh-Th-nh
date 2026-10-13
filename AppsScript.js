function getSheetByNameCaseInsensitive(ss, name) {
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
  var cleanColKey = colKey.toLowerCase().replace(/[\s_-]+/g, '');
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
    return (h || '').toString().toLowerCase().trim().replace(/[\s_-]+/g, ''); 
  });

  for (var i = 0; i < aliases.length; i++) {
    var target = aliases[i].toLowerCase().replace(/[\s_-]+/g, '');
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
          // Format Date instances properly to YYYY-MM-DD
          if (val instanceof Date) {
            try {
              val = Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
            } catch (e) {
              val = val.toISOString().split('T')[0];
            }
          }
          // Convert numeric strings back to numbers for IDs
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
}
