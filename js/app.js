/**
 * Batticaloa Early Years School — Management Portal
 * Vanilla JS + localStorage
 */

const STORAGE_KEY = 'beys_school_data';
const SETTINGS_KEY = 'beys_school_settings';
const TEACHERS_KEY = 'beys_teachers';
const SESSION_KEY = 'beys_session';
const DEFAULT_SCHOOL_NAME = 'Batticaloa Early Years School';
const DEFAULT_LOGO = 'assets/logo.png';

const App = (() => {
  let students = [];
  let teachers = [];
  let session = null;
  let settings = { schoolName: DEFAULT_SCHOOL_NAME, logo: null };
  let currentView = 'dashboard';
  let selectedFeeMonth = getCurrentMonthKey();
  let html5QrCode = null;
  let scannerActive = false;
  let deleteTargetId = null;
  let currentIdCardStudentId = null;
  let pendingPhotoData = null; // compressed base64 for registration
  let webcamStream = null;
  let pendingSettings = { schoolName: DEFAULT_SCHOOL_NAME, logo: null };

  const PHOTO_MAX_DIM = 200;
  const PHOTO_MAX_BYTES = 80000; // ~80 KB target per photo
  const LOGO_MAX_DIM = 128;
  const LOGO_MAX_BYTES = 50000;

  // ─── Data Layer ───────────────────────────────────────────────

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        settings = {
          schoolName: parsed.schoolName || DEFAULT_SCHOOL_NAME,
          logo: parsed.logo || null
        };
      }
    } catch {
      settings = { schoolName: DEFAULT_SCHOOL_NAME, logo: null };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        showToast('Storage full! Try a smaller logo image.', 'error');
      }
      throw e;
    }
  }

  function getSchoolName() {
    return settings.schoolName || DEFAULT_SCHOOL_NAME;
  }

  function getLogoUrl() {
    return settings.logo || DEFAULT_LOGO;
  }

  function applySettings() {
    const name = getSchoolName();
    const logoUrl = getLogoUrl();

    const nameEl = document.getElementById('school-name');
    const logoEl = document.getElementById('school-logo');
    const favicon = document.getElementById('favicon');

    if (nameEl) nameEl.textContent = name;
    if (logoEl) {
      logoEl.src = logoUrl;
      logoEl.alt = `${name} logo`;
    }
    if (favicon) favicon.href = logoUrl;
    document.title = `${name} — Management Portal`;

    const authNameEl = document.getElementById('auth-school-name');
    const authLogoEl = document.getElementById('auth-logo');
    if (authNameEl) authNameEl.textContent = name;
    if (authLogoEl) {
      authLogoEl.src = logoUrl;
      authLogoEl.alt = `${name} logo`;
    }

    document.querySelectorAll('[data-school-brand]').forEach(block => {
      const brandName = block.querySelector('[data-school-brand-name]');
      const brandLogo = block.querySelector('[data-school-brand-logo]');
      if (brandName) brandName.textContent = name;
      if (brandLogo) {
        brandLogo.src = logoUrl;
        brandLogo.alt = `${name} logo`;
      }
    });
  }

  function syncPendingSettingsFromSaved() {
    pendingSettings = {
      schoolName: settings.schoolName || DEFAULT_SCHOOL_NAME,
      logo: settings.logo
    };
  }

  function getSavedSchoolName() {
    return settings.schoolName || DEFAULT_SCHOOL_NAME;
  }

  function settingsLogoEqual(a, b) {
    if (!a && !b) return true;
    return a === b;
  }

  function collectPendingSettingsFromForm() {
    const nameInput = document.getElementById('settings-school-name');
    pendingSettings.schoolName = nameInput?.value.trim() || getSavedSchoolName();
    return pendingSettings;
  }

  function hasPendingSettingsChanges() {
    collectPendingSettingsFromForm();
    const nameChanged = pendingSettings.schoolName !== getSavedSchoolName();
    const logoChanged = !settingsLogoEqual(pendingSettings.logo, settings.logo);
    return nameChanged || logoChanged;
  }

  function updateSettingsUnsavedHint() {
    const hint = document.getElementById('settings-unsaved-hint');
    if (!hint) return;
    hint.classList.toggle('hidden', !hasPendingSettingsChanges());
  }

  function buildSettingsChangeSummary() {
    collectPendingSettingsFromForm();
    const changes = [];

    if (pendingSettings.schoolName !== getSavedSchoolName()) {
      changes.push(`School name: <strong>${escapeHtml(getSavedSchoolName())}</strong> → <strong>${escapeHtml(pendingSettings.schoolName)}</strong>`);
    }
    if (!settingsLogoEqual(pendingSettings.logo, settings.logo)) {
      if (pendingSettings.logo && settings.logo) {
        changes.push('School logo will be replaced with a new image.');
      } else if (pendingSettings.logo) {
        changes.push('A custom school logo will be applied.');
      } else {
        changes.push('School logo will be reset to the default.');
      }
    }

    return changes;
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      students = raw ? JSON.parse(raw) : [];
    } catch {
      students = [];
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        showToast('Storage full! Remove students or use smaller photos.', 'error');
      }
      throw e;
    }
  }

  function generateId() {
    return 'STU-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  function generateTeacherId() {
    return 'TCH-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  // ─── Teacher Auth ───────────────────────────────────────────────

  function loadTeachers() {
    try {
      const raw = localStorage.getItem(TEACHERS_KEY);
      teachers = raw ? JSON.parse(raw) : [];
    } catch {
      teachers = [];
    }
  }

  function saveTeachers() {
    localStorage.setItem(TEACHERS_KEY, JSON.stringify(teachers));
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      session = raw ? JSON.parse(raw) : null;
    } catch {
      session = null;
    }
  }

  function saveSession(data) {
    session = data;
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function clearSession() {
    session = null;
    localStorage.removeItem(SESSION_KEY);
  }

  function normalizeNic(nic) {
    return nic.trim().toUpperCase();
  }

  function isValidPassword(password) {
    return typeof password === 'string' && password.length >= 1 && password.length <= 6;
  }

  async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function getTeacherById(id) {
    return teachers.find(t => t.id === id) || null;
  }

  function getTeacherByNic(nic) {
    const normalized = normalizeNic(nic);
    return teachers.find(t => t.nic === normalized) || null;
  }

  function getTeacherByEmail(email) {
    const normalized = email.trim().toLowerCase();
    return teachers.find(t => t.email === normalized) || null;
  }

  function isAuthenticated() {
    if (!session?.teacherId) return false;
    return !!getTeacherById(session.teacherId);
  }

  function getCurrentTeacher() {
    if (!isAuthenticated()) return null;
    return getTeacherById(session.teacherId);
  }

  function showAuthScreen() {
    if (scannerActive) stopScanner();
    if (webcamStream) stopWebcam();
    closeAllModals();
    closeSidebar();

    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    switchAuthPanel('login');
  }

  function showAppShell() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    updateTeacherInfo();
  }

  function updateTeacherInfo() {
    const el = document.getElementById('teacher-info');
    const teacher = getCurrentTeacher();
    if (!el) return;

    if (teacher) {
      el.textContent = teacher.name;
      el.title = `NIC: ${teacher.nic}`;
    } else {
      el.textContent = '';
      el.title = '';
    }
  }

  function switchAuthPanel(panel) {
    const loginPanel = document.getElementById('auth-login-panel');
    const registerPanel = document.getElementById('auth-register-panel');
    const forgotPanel = document.getElementById('auth-forgot-panel');
    if (!loginPanel || !registerPanel || !forgotPanel) return;

    loginPanel.classList.toggle('hidden', panel !== 'login');
    registerPanel.classList.toggle('hidden', panel !== 'register');
    forgotPanel.classList.toggle('hidden', panel !== 'forgot');

    if (panel === 'login') {
      document.getElementById('login-form')?.reset();
    } else if (panel === 'register') {
      document.getElementById('teacher-register-form')?.reset();
    } else if (panel === 'forgot') {
      document.getElementById('forgot-password-form')?.reset();
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();

    const email = document.getElementById('forgot-email').value.trim().toLowerCase();
    const nic = normalizeNic(document.getElementById('forgot-nic').value);
    const password = document.getElementById('forgot-password').value;
    const passwordConfirm = document.getElementById('forgot-password-confirm').value;

    if (!email || !nic) {
      showToast('Please enter your registered email and NIC.', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    if (!isValidPassword(password)) {
      showToast('Password must be 1–6 characters.', 'error');
      return;
    }
    if (password !== passwordConfirm) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    const teacherByEmail = getTeacherByEmail(email);
    const teacherByNic = getTeacherByNic(nic);

    if (!teacherByEmail || !teacherByNic || teacherByEmail.id !== teacherByNic.id) {
      showToast('No account found matching this email and NIC.', 'error');
      return;
    }

    teacherByEmail.passwordHash = await hashPassword(password);
    saveTeachers();

    document.getElementById('forgot-password-form').reset();
    showToast('Password reset successful! Please log in with your new password.');
    switchAuthPanel('login');

    const loginNic = document.getElementById('login-nic');
    if (loginNic) loginNic.value = nic;
  }

  async function handleLogin(e) {
    e.preventDefault();
    const nic = document.getElementById('login-nic').value;
    const password = document.getElementById('login-password').value;

    if (!nic.trim()) {
      showToast('Please enter your NIC number.', 'error');
      return;
    }
    if (!isValidPassword(password)) {
      showToast('Password must be 1–6 characters.', 'error');
      return;
    }

    const teacher = getTeacherByNic(nic);
    if (!teacher) {
      showToast('Invalid NIC or password.', 'error');
      return;
    }

    const hash = await hashPassword(password);
    if (hash !== teacher.passwordHash) {
      showToast('Invalid NIC or password.', 'error');
      return;
    }

    saveSession({ teacherId: teacher.id, loginAt: new Date().toISOString() });
    document.getElementById('login-form').reset();
    showToast(`Welcome back, ${teacher.name}!`);
    showAppShell();
    navigate('dashboard');
  }

  async function handleTeacherRegister(e) {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);

    const name = data.get('name').trim();
    const mobile = data.get('mobile').trim();
    const nic = normalizeNic(data.get('nic'));
    const email = data.get('email').trim().toLowerCase();
    const password = data.get('password');
    const passwordConfirm = data.get('passwordConfirm');

    if (!name || !mobile || !nic || !email) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    if (!isValidPassword(password)) {
      showToast('Password must be 1–6 characters.', 'error');
      return;
    }
    if (password !== passwordConfirm) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    if (getTeacherByNic(nic)) {
      showToast('A teacher with this NIC is already registered.', 'error');
      return;
    }
    if (teachers.some(t => t.email === email)) {
      showToast('A teacher with this email is already registered.', 'error');
      return;
    }

    const passwordHash = await hashPassword(password);
    const teacher = {
      id: generateTeacherId(),
      name,
      mobile,
      nic,
      email,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    teachers.push(teacher);
    saveTeachers();

    form.reset();
    showToast('Registration successful! Please log in.');
    switchAuthPanel('login');
    const loginNic = document.getElementById('login-nic');
    if (loginNic) loginNic.value = nic;
  }

  function logout() {
    if (scannerActive) stopScanner();
    if (webcamStream) stopWebcam();
    closeAllModals();
    clearSession();
    showAuthScreen();
    showToast('You have been logged out.');
  }

  function getTeacherSnapshot() {
    const teacher = getCurrentTeacher();
    if (!teacher) return null;
    return {
      teacherId: teacher.id,
      teacherName: teacher.name,
      nic: teacher.nic
    };
  }

  function formatRecordedBy(record) {
    if (!record?.recordedBy?.teacherName) return '';
    return `<p class="text-[10px] text-slate-400">By ${escapeHtml(record.recordedBy.teacherName)}</p>`;
  }

  function getStudentById(id) {
    return students.find(s => s.id === id) || null;
  }

  function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDateTime(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }

  function getFeeStatus(student, monthKey) {
    return normalizeFeeRecord(student.fees?.[monthKey]).status;
  }

  function getFeePaidDate(student, monthKey) {
    return normalizeFeeRecord(student.fees?.[monthKey]).paidDate;
  }

  function normalizeFeeRecord(record) {
    if (!record) return { status: 'unpaid', paidDate: null };
    if (typeof record === 'string') {
      return { status: record, paidDate: record === 'paid' ? null : null };
    }
    return {
      status: record.status === 'paid' ? 'paid' : 'unpaid',
      paidDate: record.paidDate || null
    };
  }

  function setMonthlyFee(student, monthKey, status) {
    if (!student.fees) student.fees = {};
    if (status === 'paid') {
      student.fees[monthKey] = { status: 'paid', paidDate: todayDateStr() };
    } else {
      student.fees[monthKey] = { status: 'unpaid', paidDate: null };
    }
  }

  function getStudentFeeMonths(student) {
    if (!student.fees) return [];
    return Object.keys(student.fees).sort().reverse();
  }

  function isCurrentMonth(monthKey) {
    return monthKey === getCurrentMonthKey();
  }

  // ─── Photo Compression & Avatar Helpers ─────────────────────────

  function compressLogoImage(source) {
    return loadImageFromSource(source).then(img => {
      const size = LOGO_MAX_DIM;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

      let quality = 0.82;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > LOGO_MAX_BYTES && quality > 0.4) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      return dataUrl;
    });
  }

  function updateSettingsLogoPreview() {
    const preview = document.getElementById('settings-logo-preview');
    const hint = document.getElementById('settings-logo-hint');
    if (!preview) return;

    const logoUrl = pendingSettings.logo || DEFAULT_LOGO;
    preview.src = logoUrl;
    if (hint) {
      hint.textContent = pendingSettings.logo
        ? `Custom logo · ${formatBytes(pendingSettings.logo)} · 128×128 px`
        : 'Using default logo';
    }
    updateSettingsUnsavedHint();
  }

  function renderSettingsView() {
    syncPendingSettingsFromSaved();
    const nameInput = document.getElementById('settings-school-name');
    if (nameInput) nameInput.value = pendingSettings.schoolName;
    updateSettingsLogoPreview();
    updateSettingsUnsavedHint();
  }

  async function handleSettingsLogoFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file.', 'error');
      return;
    }
    try {
      pendingSettings.logo = await compressLogoImage(file);
      updateSettingsLogoPreview();
      showToast('Logo selected. Click Save Settings to apply.');
    } catch {
      showToast('Failed to process logo.', 'error');
    }
    e.target.value = '';
  }

  function resetSettingsLogo() {
    pendingSettings.logo = null;
    updateSettingsLogoPreview();
    showToast('Logo reset to default. Click Save Settings to apply.');
  }

  function openSettingsConfirmModal() {
    const changes = buildSettingsChangeSummary();
    const summaryEl = document.getElementById('settings-confirm-summary');
    const checkbox = document.getElementById('settings-confirm-checkbox');
    const applyBtn = document.getElementById('settings-confirm-apply');

    if (summaryEl) {
      summaryEl.innerHTML = changes.length
        ? `<p class="font-medium text-slate-700">The following changes will be applied:</p><ul>${changes.map(c => `<li>${c}</li>`).join('')}</ul>`
        : '<p>No changes detected.</p>';
    }

    if (checkbox) checkbox.checked = false;
    if (applyBtn) applyBtn.disabled = true;
    openModal('settings-confirm-modal');
  }

  function commitSettingsChanges() {
    collectPendingSettingsFromForm();
    settings.schoolName = pendingSettings.schoolName;
    settings.logo = pendingSettings.logo;

    try {
      saveSettings();
      applySettings();
      closeModal('settings-confirm-modal');
      syncPendingSettingsFromSaved();
      updateSettingsUnsavedHint();
      showToast('School settings saved!');
    } catch {
      /* error toast shown in saveSettings */
    }
  }

  function handleSettingsSave(e) {
    e.preventDefault();
    const name = document.getElementById('settings-school-name').value.trim();
    if (!name) {
      showToast('School name cannot be empty.', 'error');
      return;
    }

    pendingSettings.schoolName = name;

    if (!hasPendingSettingsChanges()) {
      showToast('No changes to save.', 'warning');
      return;
    }

    openSettingsConfirmModal();
  }

  function handleSettingsConfirmApply() {
    const checkbox = document.getElementById('settings-confirm-checkbox');
    if (!checkbox?.checked) {
      showToast('Please confirm that you understand the impact of these changes.', 'error');
      return;
    }
    commitSettingsChanges();
  }

  function loadImageFromSource(source) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      if (source instanceof File || source instanceof Blob) {
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; };
        reader.onerror = reject;
        reader.readAsDataURL(source);
      } else {
        img.src = source;
      }
    });
  }

  function compressImage(source, maxDim = PHOTO_MAX_DIM) {
    return loadImageFromSource(source).then(img => {
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
      } else {
        if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      let quality = 0.75;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > PHOTO_MAX_BYTES && quality > 0.35) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      return dataUrl;
    });
  }

  function formatBytes(base64) {
    if (!base64) return '';
    const bytes = Math.round((base64.length - 'data:image/jpeg;base64,'.length) * 0.75);
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function renderStudentAvatar(student, sizeClass = '') {
    const cls = `student-avatar ${sizeClass}`.trim();
    if (student.photo) {
      return `<div class="${cls}"><img src="${student.photo}" alt="${escapeHtml(student.name)}"></div>`;
    }
    return `<div class="${cls} avatar">${getInitials(student.name)}</div>`;
  }

  function setPhotoPreview(dataUrl) {
    pendingPhotoData = dataUrl;
    const preview = document.getElementById('photo-preview');
    const img = document.getElementById('photo-preview-img');
    const hint = document.getElementById('photo-size-hint');
    const removeBtn = document.getElementById('photo-remove-btn');

    if (dataUrl) {
      img.src = dataUrl;
      img.classList.remove('hidden');
      preview.classList.add('has-photo');
      hint.textContent = `Compressed: ${formatBytes(dataUrl)}`;
      hint.classList.remove('hidden');
      removeBtn.classList.remove('hidden');
    } else {
      img.src = '';
      img.classList.add('hidden');
      preview.classList.remove('has-photo');
      hint.classList.add('hidden');
      removeBtn.classList.add('hidden');
    }
  }

  function clearPhotoPreview() {
    pendingPhotoData = null;
    setPhotoPreview(null);
    stopWebcam();
  }

  async function handlePhotoFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file.', 'error');
      return;
    }
    try {
      const compressed = await compressImage(file);
      setPhotoPreview(compressed);
      showToast('Photo uploaded and compressed.');
    } catch {
      showToast('Failed to process image.', 'error');
    }
    e.target.value = '';
  }

  async function startWebcam() {
    stopWebcam();
    const panel = document.getElementById('webcam-panel');
    const video = document.getElementById('webcam-video');

    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      video.srcObject = webcamStream;
      panel.classList.remove('hidden');
    } catch {
      showToast('Camera access denied. Try uploading a photo instead.', 'error');
    }
  }

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
      webcamStream = null;
    }
    const panel = document.getElementById('webcam-panel');
    const video = document.getElementById('webcam-video');
    if (panel) panel.classList.add('hidden');
    if (video) video.srcObject = null;
  }

  async function captureWebcamPhoto() {
    const video = document.getElementById('webcam-video');
    const canvas = document.getElementById('webcam-canvas');
    if (!video.videoWidth) {
      showToast('Camera not ready. Please wait a moment.', 'error');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const compressed = await compressImage(dataUrl);
      setPhotoPreview(compressed);
      stopWebcam();
      showToast('Photo captured!');
    } catch {
      showToast('Failed to capture photo.', 'error');
    }
  }

  // ─── Toast Notifications ──────────────────────────────────────

  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ─── Navigation ─────────────────────────────────────────────────

  const viewTitles = {
    dashboard: 'Dashboard',
    register: 'Register Student',
    students: 'All Students',
    attendance: 'Attendance Scanner',
    fees: 'Fee Management',
    settings: 'School Settings'
  };

  function navigate(view) {
    if (!isAuthenticated()) {
      showAuthScreen();
      return;
    }

    if (currentView === 'attendance' && view !== 'attendance') {
      stopScanner();
    }
    if (currentView === 'register' && view !== 'register') {
      stopWebcam();
    }

    currentView = view;
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
    });
    const target = document.getElementById(`view-${view}`);
    target.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    document.getElementById('page-title').textContent = viewTitles[view] || view;
    closeSidebar();

    refreshView(view);
  }

  function refreshView(view) {
    switch (view) {
      case 'dashboard': renderDashboard(); break;
      case 'students': renderStudentsTable(); break;
      case 'attendance': renderAttendanceViews(); break;
      case 'fees': renderFeesView(); break;
      case 'settings': renderSettingsView(); break;
    }
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
  }

  // ─── Registration ───────────────────────────────────────────────

  function handleRegistration(e) {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);

    const student = {
      id: generateId(),
      name: data.get('name').trim(),
      age: parseInt(data.get('age'), 10),
      parentName: data.get('parentName').trim(),
      parentMobile: data.get('parentMobile').trim(),
      address: data.get('address').trim(),
      registrationDate: data.get('registrationDate'),
      photo: pendingPhotoData || null,
      fees: {},
      attendance: []
    };

    const teacherSnapshot = getTeacherSnapshot();
    if (teacherSnapshot) {
      student.registeredBy = teacherSnapshot;
    }

    student.fees[getCurrentMonthKey()] = { status: 'unpaid', paidDate: null };
    students.push(student);

    try {
      saveData();
    } catch {
      students.pop();
      return;
    }

    form.reset();
    clearPhotoPreview();
    setDefaultRegistrationDate();
    showToast(`${student.name} registered successfully!`);
    showIdCard(student.id);
    navigate('students');
  }

  function setDefaultRegistrationDate() {
    const input = document.getElementById('registration-date');
    if (input) input.value = todayDateStr();
  }

  // ─── Dashboard ──────────────────────────────────────────────────

  function renderDashboard() {
    const monthKey = getCurrentMonthKey();
    const today = todayDateStr();

    document.getElementById('stat-total').textContent = students.length;

    let presentToday = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    students.forEach(s => {
      const todayRecords = (s.attendance || []).filter(a => a.date === today);
      if (todayRecords.length > 0) presentToday++;

      if (getFeeStatus(s, monthKey) === 'paid') paidCount++;
      else unpaidCount++;
    });

    document.getElementById('stat-present').textContent = presentToday;
    document.getElementById('stat-paid').textContent = paidCount;
    document.getElementById('stat-unpaid').textContent = unpaidCount;

    const recentContainer = document.getElementById('recent-attendance');
    const allRecords = [];

    students.forEach(s => {
      (s.attendance || []).forEach(a => {
        allRecords.push({ ...a, studentName: s.name, studentId: s.id, studentPhoto: s.photo });
      });
    });

    allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recent = allRecords.slice(0, 8);

    if (recent.length === 0) {
      recentContainer.innerHTML = '<p class="text-sm text-slate-400 italic">No attendance records yet.</p>';
    } else {
      recentContainer.innerHTML = recent.map(r => {
        const avatar = r.studentPhoto
          ? `<div class="avatar"><img src="${r.studentPhoto}" alt=""></div>`
          : `<div class="avatar">${getInitials(r.studentName)}</div>`;
        return `
        <div class="attendance-item">
          ${avatar}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(r.studentName)}</p>
            <p class="text-xs text-slate-400">${formatDateTime(r.timestamp)}</p>
            ${formatRecordedBy(r)}
          </div>
        </div>`;
      }).join('');
    }
  }

  // ─── Students Table ─────────────────────────────────────────────

  function renderStudentsTable(filter = '') {
    const tbody = document.getElementById('students-table-body');
    const monthKey = getCurrentMonthKey();
    const query = filter.toLowerCase().trim();

    let filtered = students;
    if (query) {
      filtered = students.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.parentName.toLowerCase().includes(query) ||
        s.parentMobile.includes(query) ||
        s.id.toLowerCase().includes(query)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400 italic">${students.length === 0 ? 'No students registered yet.' : 'No students match your search.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => {
      const feeStatus = getFeeStatus(s, monthKey);
      const badge = feeStatus === 'paid'
        ? `<span class="badge-paid">Paid</span><span class="block text-[10px] text-slate-400 mt-0.5">${formatMonthLabel(monthKey)}</span>`
        : `<span class="badge-unpaid">Unpaid</span><span class="block text-[10px] text-slate-400 mt-0.5">${formatMonthLabel(monthKey)}</span>`;

      return `
        <tr>
          <td>
            <div class="flex items-center gap-2">
              ${renderStudentAvatar(s, 'student-avatar-md')}
              <div>
                <p class="font-medium text-slate-800">${escapeHtml(s.name)}</p>
                <p class="text-xs text-slate-400 md:hidden">Age ${s.age}</p>
              </div>
            </div>
          </td>
          <td class="hidden md:table-cell text-slate-600">${s.age}</td>
          <td class="hidden lg:table-cell text-slate-600">${escapeHtml(s.parentName)}</td>
          <td class="hidden lg:table-cell text-slate-600">${escapeHtml(s.parentMobile)}</td>
          <td class="hidden sm:table-cell text-slate-600">${formatDate(s.registrationDate)}</td>
          <td>${badge}</td>
          <td class="text-right">
            <div class="flex items-center justify-end gap-1">
              <button onclick="App.showIdCard('${s.id}')" class="btn-sm btn-secondary" title="ID Card">🪪 ID</button>
              <button onclick="App.showStudentProfile('${s.id}')" class="btn-sm btn-secondary" title="View">View</button>
              <button onclick="App.confirmDelete('${s.id}')" class="btn-sm text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg" title="Delete">✕</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ─── Student Profile Modal ──────────────────────────────────────

  function showStudentProfile(id) {
    const student = getStudentById(id);
    if (!student) return;

    const monthKey = getCurrentMonthKey();
    const feeStatus = getFeeStatus(student, monthKey);
    const attendanceCount = (student.attendance || []).length;

    document.getElementById('student-modal-body').innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center gap-4">
          ${renderStudentAvatar(student, 'student-avatar-lg')}
          <div>
            <h4 class="text-lg font-bold text-slate-800">${escapeHtml(student.name)}</h4>
            <p class="text-sm text-slate-500">Age ${student.age} · ID: ${student.id}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-slate-400 text-xs">Parent</p>
            <p class="font-medium">${escapeHtml(student.parentName)}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-slate-400 text-xs">Mobile</p>
            <p class="font-medium">${escapeHtml(student.parentMobile)}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3 col-span-2">
            <p class="text-slate-400 text-xs">Address</p>
            <p class="font-medium">${escapeHtml(student.address)}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-slate-400 text-xs">Registered</p>
            <p class="font-medium">${formatDate(student.registrationDate)}</p>
          </div>
          ${student.registeredBy ? `
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-slate-400 text-xs">Registered By</p>
            <p class="font-medium">${escapeHtml(student.registeredBy.teacherName)}</p>
            <p class="text-xs text-slate-400">NIC: ${escapeHtml(student.registeredBy.nic)}</p>
          </div>
          ` : ''}
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-slate-400 text-xs">Fee Status (${formatMonthLabel(monthKey)})</p>
            <p class="font-medium">${feeStatus === 'paid' ? '✅ Paid' : '❌ Unpaid'}${getFeePaidDate(student, monthKey) ? ` · ${formatDate(getFeePaidDate(student, monthKey))}` : ''}</p>
          </div>
        </div>
        <div>
          <p class="text-sm font-medium text-slate-700 mb-2">Monthly Payment History</p>
          <div class="space-y-1 max-h-36 overflow-y-auto">
            ${getStudentFeeMonths(student).length === 0
              ? '<p class="text-xs text-slate-400 italic">No payment records yet.</p>'
              : getStudentFeeMonths(student).slice(0, 12).map(mk => {
                  const st = getFeeStatus(student, mk);
                  const pd = getFeePaidDate(student, mk);
                  return `<div class="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-1.5">
                    <span class="text-slate-600">${formatMonthLabel(mk)}</span>
                    <span class="${st === 'paid' ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}">${st === 'paid' ? 'Paid' : 'Unpaid'}${pd ? ` (${formatDate(pd)})` : ''}</span>
                  </div>`;
                }).join('')
            }
          </div>
        </div>
        <div>
          <p class="text-sm font-medium text-slate-700 mb-2">Attendance History (${attendanceCount} records)</p>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            ${(student.attendance || []).length === 0
              ? '<p class="text-xs text-slate-400 italic">No attendance yet.</p>'
              : [...student.attendance].reverse().slice(0, 10).map(a => `
                  <div class="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">
                    ${formatDateTime(a.timestamp)}
                    ${a.recordedBy ? `<span class="text-slate-400"> · ${escapeHtml(a.recordedBy.teacherName)}</span>` : ''}
                  </div>
                `).join('')
            }
          </div>
        </div>
        <button onclick="App.showIdCard('${student.id}')" class="btn-primary w-full">View ID Card</button>
      </div>
    `;

    openModal('student-modal');
  }

  // ─── ID Card ────────────────────────────────────────────────────

  function showIdCard(id) {
    const student = getStudentById(id);
    if (!student) return;

    currentIdCardStudentId = id;
    const container = document.getElementById('id-card-content');
    container.innerHTML = buildIdCardHtml(student);

    const qrContainer = container.querySelector('#qr-code-target');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: student.id,
      width: 180,
      height: 180,
      colorDark: '#1e40af',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    openModal('id-card-modal');
  }

  function buildIdCardHtml(student) {
    const schoolName = getSchoolName();
    const logoUrl = getLogoUrl();
    return `
      <div class="id-card" id="printable-id-card">
        <div class="id-card-header">
          <img src="${logoUrl}" alt="${escapeHtml(schoolName)} logo" class="id-card-logo">
          <p class="id-card-school">${escapeHtml(schoolName)}</p>
        </div>
        <div class="id-card-qr-wrap">
          <div id="qr-code-target"></div>
        </div>
        <p class="id-card-name">${escapeHtml(student.name)}</p>
      </div>
    `;
  }

  function printIdCard() {
    window.print();
  }

  function downloadIdCard() {
    const card = document.getElementById('printable-id-card');
    if (!card || typeof html2canvas !== 'function') {
      showToast('Download unavailable. Use Print instead.', 'error');
      return;
    }

    html2canvas(card, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
      const link = document.createElement('a');
      const student = getStudentById(currentIdCardStudentId);
      link.download = `${student ? student.name.replace(/\s+/g, '_') : 'student'}_id_card.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('ID card downloaded!');
    }).catch(() => {
      showToast('Download failed. Use Print instead.', 'error');
    });
  }

  // ─── Delete Student ─────────────────────────────────────────────

  function confirmDelete(id) {
    deleteTargetId = id;
    openModal('delete-modal');
  }

  function deleteStudent() {
    if (!deleteTargetId) return;
    const student = getStudentById(deleteTargetId);
    students = students.filter(s => s.id !== deleteTargetId);
    saveData();
    closeModal('delete-modal');
    showToast(`${student ? student.name : 'Student'} deleted.`, 'warning');
    deleteTargetId = null;
    refreshView(currentView);
  }

  // ─── Attendance Scanner ─────────────────────────────────────────

  function renderAttendanceViews() {
    populateAttendanceFilter();
    renderTodayAttendance();
    renderAttendanceHistory();
  }

  function populateAttendanceFilter() {
    const select = document.getElementById('attendance-student-filter');
    const current = select.value;
    select.innerHTML = '<option value="">All Students</option>' +
      students.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    select.value = current;
  }

  function renderTodayAttendance() {
    const container = document.getElementById('today-attendance-log');
    const today = todayDateStr();
    const records = [];

    students.forEach(s => {
      (s.attendance || []).filter(a => a.date === today).forEach(a => {
        records.push({ ...a, studentName: s.name, studentPhoto: s.photo });
      });
    });

    records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (records.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-400 italic">No attendance logged today.</p>';
      return;
    }

    container.innerHTML = records.map(r => {
      const avatar = r.studentPhoto
        ? `<div class="avatar"><img src="${r.studentPhoto}" alt=""></div>`
        : `<div class="avatar">${getInitials(r.studentName)}</div>`;
      return `
      <div class="attendance-item">
        ${avatar}
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-800">${escapeHtml(r.studentName)}</p>
          <p class="text-xs text-slate-400">${formatDateTime(r.timestamp)}</p>
          ${formatRecordedBy(r)}
        </div>
        <span class="text-xs text-emerald-600 font-medium">✓ Present</span>
      </div>`;
    }).join('');
  }

  function renderAttendanceHistory(filterId = '') {
    const container = document.getElementById('attendance-history');
    const records = [];

    const source = filterId
      ? students.filter(s => s.id === filterId)
      : students;

    source.forEach(s => {
      (s.attendance || []).forEach(a => {
        records.push({ ...a, studentName: s.name, studentId: s.id, studentPhoto: s.photo });
      });
    });

    records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (records.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-400 italic">No attendance records yet.</p>';
      return;
    }

    container.innerHTML = records.slice(0, 50).map(r => {
      const avatar = r.studentPhoto
        ? `<div class="avatar"><img src="${r.studentPhoto}" alt=""></div>`
        : `<div class="avatar">${getInitials(r.studentName)}</div>`;
      return `
      <div class="attendance-item">
        ${avatar}
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-800">${escapeHtml(r.studentName)}</p>
          <p class="text-xs text-slate-400">${formatDateTime(r.timestamp)}</p>
          ${formatRecordedBy(r)}
        </div>
      </div>`;
    }).join('');
  }

  async function startScanner() {
    if (scannerActive) return;

    const readerEl = document.getElementById('qr-reader');
    readerEl.innerHTML = '';

    try {
      html5QrCode = new Html5Qrcode('qr-reader');
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {}
      );
      scannerActive = true;
      document.getElementById('start-scanner').classList.add('hidden');
      document.getElementById('stop-scanner').classList.remove('hidden');
    } catch (err) {
      showToast('Camera access denied or unavailable. Please allow camera permissions.', 'error');
      console.error('Scanner error:', err);
    }
  }

  async function stopScanner() {
    if (!scannerActive || !html5QrCode) return;
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch {
      /* ignore stop errors */
    }
    scannerActive = false;
    html5QrCode = null;
    document.getElementById('start-scanner').classList.remove('hidden');
    document.getElementById('stop-scanner').classList.add('hidden');
  }

  let lastScanTime = 0;
  let lastScanId = '';

  function onScanSuccess(decodedText) {
    const now = Date.now();
    if (decodedText === lastScanId && now - lastScanTime < 3000) return;

    const student = getStudentById(decodedText);
    if (!student) {
      showToast('Unknown QR code. Student not found.', 'error');
      return;
    }

    lastScanTime = now;
    lastScanId = decodedText;

    const timestamp = new Date().toISOString();
    const date = todayDateStr();

    if (!student.attendance) student.attendance = [];

    const alreadyToday = student.attendance.some(a => a.date === date);
    let statusText = '';
    if (alreadyToday) {
      showToast(`${student.name} already marked present today.`, 'warning');
      statusText = 'Already marked present today';
    } else {
      const record = { date, timestamp };
      const teacher = getCurrentTeacher();
      if (teacher) {
        record.recordedBy = {
          teacherId: teacher.id,
          teacherName: teacher.name
        };
      }
      student.attendance.push(record);
      saveData();
      showToast(`✓ ${student.name} — Attendance logged!`);
      statusText = '✓ Attendance logged successfully';
    }

    const resultEl = document.getElementById('scan-result');
    const photoEl = document.getElementById('scan-result-photo');
    const avatarEl = document.getElementById('scan-result-avatar');

    resultEl.classList.remove('hidden');

    if (student.photo) {
      photoEl.src = student.photo;
      photoEl.alt = student.name;
      photoEl.classList.remove('hidden');
      avatarEl.classList.add('hidden');
      avatarEl.textContent = '';
    } else {
      photoEl.classList.add('hidden');
      photoEl.src = '';
      avatarEl.textContent = getInitials(student.name);
      avatarEl.classList.remove('hidden');
    }

    document.getElementById('scan-result-name').textContent = student.name;
    document.getElementById('scan-result-time').textContent = formatDateTime(timestamp);
    document.getElementById('scan-result-status').textContent = statusText;

    renderTodayAttendance();
    renderAttendanceHistory(document.getElementById('attendance-student-filter').value);
  }

  // ─── Fee Management ─────────────────────────────────────────────

  function renderFeesView() {
    document.getElementById('fee-month-picker').value = selectedFeeMonth;
    document.getElementById('fee-month-label').textContent = formatMonthLabel(selectedFeeMonth);

    const currentBadge = document.getElementById('fee-current-badge');
    if (currentBadge) {
      currentBadge.classList.toggle('hidden', !isCurrentMonth(selectedFeeMonth));
    }

    const tbody = document.getElementById('fees-table-body');
    let paid = 0;
    let unpaid = 0;

    if (students.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400 italic">No students registered yet.</td></tr>';
      document.getElementById('fee-count-paid').textContent = '0';
      document.getElementById('fee-count-unpaid').textContent = '0';
      document.getElementById('fee-count-total').textContent = '0';
      return;
    }

    students.forEach(s => {
      if (getFeeStatus(s, selectedFeeMonth) === 'paid') paid++;
      else unpaid++;
    });

    if (tbody) {
      tbody.innerHTML = students.map(s => {
        const status = getFeeStatus(s, selectedFeeMonth);
        const paidDate = getFeePaidDate(s, selectedFeeMonth);
        const statusBadge = status === 'paid'
          ? '<span class="badge-paid">Paid</span>'
          : '<span class="badge-unpaid">Unpaid</span>';

        return `
          <tr>
            <td>
              <div class="flex items-center gap-2">
                ${renderStudentAvatar(s, 'student-avatar-md')}
                <div>
                  <p class="font-medium text-slate-800">${escapeHtml(s.name)}</p>
                  <p class="text-xs text-slate-400">Age ${s.age}</p>
                </div>
              </div>
            </td>
            <td class="hidden sm:table-cell text-slate-600">${escapeHtml(s.parentName)}</td>
            <td>${statusBadge}</td>
            <td class="text-slate-600">${paidDate ? formatDate(paidDate) : '—'}</td>
            <td class="text-right">
              <div class="flex items-center justify-end gap-1">
                ${status === 'paid'
                  ? `<button onclick="App.setFee('${s.id}', 'unpaid')" class="btn-sm btn-secondary">Mark Unpaid</button>`
                  : `<button onclick="App.setFee('${s.id}', 'paid')" class="btn-sm btn-primary">Mark Paid</button>`
                }
              </div>
            </td>
          </tr>`;
      }).join('');
    }

    document.getElementById('fee-count-paid').textContent = paid;
    document.getElementById('fee-count-unpaid').textContent = unpaid;
    document.getElementById('fee-count-total').textContent = students.length;
  }

  function setFee(studentId, status) {
    const student = getStudentById(studentId);
    if (!student) return;

    setMonthlyFee(student, selectedFeeMonth, status);
    saveData();

    const monthLabel = formatMonthLabel(selectedFeeMonth);
    showToast(
      `${student.name} — ${monthLabel} marked as ${status}.`,
      status === 'paid' ? 'success' : 'warning'
    );
    renderFeesView();
    if (currentView === 'students') renderStudentsTable(document.getElementById('student-search').value);
    if (currentView === 'dashboard') renderDashboard();
  }

  function toggleFee(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;
    const current = getFeeStatus(student, selectedFeeMonth);
    setFee(studentId, current === 'paid' ? 'unpaid' : 'paid');
  }

  function markAllFees(status) {
    if (students.length === 0) return;
    const monthLabel = formatMonthLabel(selectedFeeMonth);
    students.forEach(s => setMonthlyFee(s, selectedFeeMonth, status));
    saveData();
    showToast(`All students marked as ${status} for ${monthLabel}.`, status === 'paid' ? 'success' : 'warning');
    renderFeesView();
    if (currentView === 'dashboard') renderDashboard();
  }

  function changeFeeMonth(delta) {
    const [year, month] = selectedFeeMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    selectedFeeMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    renderFeesView();
  }

  // ─── Modals ─────────────────────────────────────────────────────

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  }

  // ─── Utilities ──────────────────────────────────────────────────

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function updateCurrentDate() {
    const el = document.getElementById('current-date');
    el.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // ─── Event Bindings ─────────────────────────────────────────────

  function bindAuthEvents() {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('teacher-register-form')?.addEventListener('submit', handleTeacherRegister);
    document.getElementById('forgot-password-form')?.addEventListener('submit', handleForgotPassword);
    document.getElementById('show-register-btn')?.addEventListener('click', () => switchAuthPanel('register'));
    document.getElementById('show-login-btn')?.addEventListener('click', () => switchAuthPanel('login'));
    document.getElementById('show-forgot-btn')?.addEventListener('click', () => switchAuthPanel('forgot'));
    document.getElementById('show-login-from-forgot-btn')?.addEventListener('click', () => switchAuthPanel('login'));
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }

  function bindEvents() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.view));
    });

    document.getElementById('menu-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('visible');
    });

    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    document.getElementById('registration-form').addEventListener('submit', handleRegistration);
    document.getElementById('registration-form').addEventListener('reset', () => {
      clearPhotoPreview();
      setDefaultRegistrationDate();
    });

    document.getElementById('photo-upload-btn').addEventListener('click', () => {
      document.getElementById('photo-file').click();
    });
    document.getElementById('photo-file').addEventListener('change', handlePhotoFile);
    document.getElementById('photo-camera-btn').addEventListener('click', startWebcam);
    document.getElementById('photo-remove-btn').addEventListener('click', clearPhotoPreview);
    document.getElementById('webcam-capture').addEventListener('click', captureWebcamPhoto);
    document.getElementById('webcam-cancel').addEventListener('click', stopWebcam);

    document.getElementById('student-search').addEventListener('input', (e) => {
      renderStudentsTable(e.target.value);
    });

    document.getElementById('start-scanner').addEventListener('click', startScanner);
    document.getElementById('stop-scanner').addEventListener('click', stopScanner);

    document.getElementById('attendance-student-filter').addEventListener('change', (e) => {
      renderAttendanceHistory(e.target.value);
    });

    document.getElementById('fee-month-picker').addEventListener('change', (e) => {
      selectedFeeMonth = e.target.value;
      renderFeesView();
    });

    document.getElementById('prev-month').addEventListener('click', () => changeFeeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeFeeMonth(1));
    document.getElementById('fee-mark-all-paid').addEventListener('click', () => markAllFees('paid'));
    document.getElementById('fee-mark-all-unpaid').addEventListener('click', () => markAllFees('unpaid'));
    document.getElementById('fee-go-current-month').addEventListener('click', () => {
      selectedFeeMonth = getCurrentMonthKey();
      renderFeesView();
    });

    document.getElementById('settings-form').addEventListener('submit', handleSettingsSave);
    document.getElementById('settings-school-name')?.addEventListener('input', updateSettingsUnsavedHint);
    document.getElementById('settings-logo-upload').addEventListener('click', () => {
      document.getElementById('settings-logo-file').click();
    });
    document.getElementById('settings-logo-file').addEventListener('change', handleSettingsLogoFile);
    document.getElementById('settings-logo-reset').addEventListener('click', resetSettingsLogo);
    document.getElementById('settings-confirm-checkbox')?.addEventListener('change', (e) => {
      const applyBtn = document.getElementById('settings-confirm-apply');
      if (applyBtn) applyBtn.disabled = !e.target.checked;
    });
    document.getElementById('settings-confirm-apply')?.addEventListener('click', handleSettingsConfirmApply);
    document.getElementById('settings-confirm-cancel')?.addEventListener('click', () => {
      closeModal('settings-confirm-modal');
    });

    document.getElementById('print-id-card').addEventListener('click', printIdCard);
    document.getElementById('download-id-card').addEventListener('click', downloadIdCard);
    document.getElementById('confirm-delete').addEventListener('click', deleteStudent);

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal').classList.add('hidden');
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => {
        backdrop.closest('.modal').classList.add('hidden');
      });
    });
  }

  // ─── Init ───────────────────────────────────────────────────────

  function init() {
    loadSettings();
    syncPendingSettingsFromSaved();
    loadTeachers();
    loadSession();
    loadData();
    applySettings();
    bindEvents();
    bindAuthEvents();
    setDefaultRegistrationDate();
    updateCurrentDate();

    if (isAuthenticated()) {
      showAppShell();
      navigate('dashboard');
    } else {
      showAuthScreen();
    }
  }

  return {
    init,
    navigate,
    logout,
    showIdCard,
    showStudentProfile,
    confirmDelete,
    toggleFee,
    setFee,
    markAllFees
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
