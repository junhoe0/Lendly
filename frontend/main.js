/**
 * Lendly - Library Lending Application
 * Frontend JavaScript with complete REST API backend integration.
 */

// ---------- Configuration ----------
const API_BASE = window.API_BASE || localStorage.getItem('lendly_api_base') || '/api';

// ---------- State ----------
let books = [];
let loans = [];
let currentAccount = {
  name: '',
  memberId: '',
  loanLength: 14,
};

const $ = (id) => document.getElementById(id);
let activeFilter = 'all';
let pendingBookId = null;
let toastTimeout = null;

// ---------- API Client ----------
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorMsg = `Server error (${response.status} ${response.statusText})`;
    try {
      const data = await response.json();
      if (data && (data.error || data.message)) {
        errorMsg = data.error || data.message;
      }
    } catch {
      // Body was not JSON
    }
    const err = new Error(errorMsg);
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) {
    return null;
  }

  return await response.json();
}

/**
 * Lendly REST API Interface
 */
const api = {
  // Books API
  getBooks: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.genre && params.genre !== 'all') query.set('genre', params.genre);
    if (params.available) query.set('available', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';

    const res = await apiRequest(`/books${qs}`, { method: 'GET' });
    return Array.isArray(res) ? res : (res.books || []);
  },

  getBook: async (id) => {
    return await apiRequest(`/books/${encodeURIComponent(id)}`, { method: 'GET' });
  },

  // Loans API
  getLoans: async (memberId) => {
    const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : '';
    const res = await apiRequest(`/loans${query}`, { method: 'GET' });
    return Array.isArray(res) ? res : (res.loans || []);
  },

  borrowBook: async ({ bookId, memberId, days }) => {
    return await apiRequest('/loans', {
      method: 'POST',
      body: JSON.stringify({ bookId, memberId, days }),
    });
  },

  returnBook: async ({ loanId, bookId, memberId }) => {
    try {
      // Primary REST endpoint for returns
      return await apiRequest('/loans/return', {
        method: 'POST',
        body: JSON.stringify({ loanId, bookId, memberId }),
      });
    } catch (err) {
      // Fallback: If backend implemented DELETE /loans/:id or DELETE /loans?bookId=:bookId
      if (err.status === 404 || err.status === 405) {
        if (loanId) {
          return await apiRequest(`/loans/${encodeURIComponent(loanId)}`, { method: 'DELETE' });
        }
        if (bookId) {
          return await apiRequest(`/loans?bookId=${encodeURIComponent(bookId)}`, { method: 'DELETE' });
        }
      }
      throw err;
    }
  },

  // Account API
  getAccount: async (memberId) => {
    const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : '';
    return await apiRequest(`/account${query}`, { method: 'GET' });
  },

  saveAccount: async (accountData) => {
    try {
      return await apiRequest('/account', {
        method: 'PUT',
        body: JSON.stringify(accountData),
      });
    } catch (err) {
      // Fallback: If backend implements POST /account instead of PUT
      if (err.status === 404 || err.status === 405) {
        return await apiRequest('/account', {
          method: 'POST',
          body: JSON.stringify(accountData),
        });
      }
      throw err;
    }
  },
};

// ---------- Helpers ----------
function copiesLeft(book) {
  if (typeof book.availableCopies === 'number') {
    return book.availableCopies;
  }
  const total = typeof book.copies === 'number' ? book.copies : 1;
  const activeUserLoans = loans.filter(l => String(l.bookId) === String(book.id)).length;
  return Math.max(0, total - activeUserLoans);
}

function loanStatus(dueDate) {
  if (!dueDate) return 'borrowed';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'due-soon';
  return 'borrowed';
}

function showToast(msg) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2800);
}

function loadLocalAccount() {
  try {
    const saved = localStorage.getItem('lendly_account');
    if (saved) {
      const parsed = JSON.parse(saved);
      currentAccount = { ...currentAccount, ...parsed };
    }
  } catch (e) {
    console.warn('Could not read saved account from storage:', e);
  }
}

function saveLocalAccount(data) {
  try {
    localStorage.setItem('lendly_account', JSON.stringify(data));
  } catch (e) {
    console.warn('Could not save account to storage:', e);
  }
}

function updateMemberBadge() {
  const badge = $('member-badge');
  if (!badge) return;

  if (currentAccount.name || currentAccount.memberId) {
    badge.textContent = currentAccount.name || `Member #${currentAccount.memberId}`;
    badge.className = 'badge available';
    badge.title = `Signed in as ${currentAccount.name || currentAccount.memberId} (Click to edit)`;
  } else {
    badge.textContent = 'Not signed in';
    badge.className = 'badge';
    badge.title = 'Click to open account';
  }
}

function populateAccountForm() {
  if ($('name')) $('name').value = currentAccount.name || '';
  if ($('member-id')) $('member-id').value = currentAccount.memberId || '';
  if ($('loan-length')) $('loan-length').value = String(currentAccount.loanLength || 14);
}

function updateGenreFilterChips() {
  const container = $('filters');
  if (!container) return;

  const genres = [...new Set(books.map(b => b.genre).filter(Boolean))].sort();

  // Remove previously added dynamic genre chips
  container.querySelectorAll('.chip[data-genre-chip="true"]').forEach(c => c.remove());

  // Add chip for each distinct genre
  genres.forEach(genre => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (activeFilter === genre ? ' active' : '');
    chip.dataset.filter = genre;
    chip.dataset.genreChip = 'true';
    chip.textContent = genre.charAt(0).toUpperCase() + genre.slice(1);
    container.appendChild(chip);
  });
}

// ---------- Render Books ----------
function renderBooks() {
  const q = ($('search')?.value || '').trim().toLowerCase();
  const grid = $('book-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const shown = books.filter(b => {
    const titleMatch = (b.title || '').toLowerCase().includes(q);
    const authorMatch = (b.author || '').toLowerCase().includes(q);
    const matchesText = !q || titleMatch || authorMatch;

    const left = copiesLeft(b);
    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'available' && left > 0) ||
      b.genre === activeFilter;

    return matchesText && matchesFilter;
  });

  if ($('no-results')) {
    $('no-results').classList.toggle('hidden', books.length === 0 || shown.length > 0);
  }

  const template = $('book-template');
  for (const b of shown) {
    const card = template.content.cloneNode(true);
    const left = copiesLeft(b);

    card.querySelector('.book-title').textContent = b.title || 'Untitled';
    card.querySelector('.book-author').textContent = b.author || 'Unknown author';
    card.querySelector('.book-extra').textContent = b.pages ? `${b.pages} pages` : (b.genre ? b.genre : '');

    const badge = card.querySelector('.book-status');
    badge.className = 'badge book-status ' + (left > 0 ? 'available' : 'borrowed');
    badge.textContent = left > 0 ? 'Available' : 'Borrowed';

    const btn = card.querySelector('.borrow-btn');
    btn.dataset.id = b.id;
    btn.disabled = left === 0;
    btn.textContent = left > 0 ? 'Borrow' : 'Unavailable';

    grid.appendChild(card);
  }
}

// ---------- Render Loans ----------
function renderLoans() {
  const list = $('loan-list');
  if (!list) return;
  list.innerHTML = '';
  let soon = 0, overdue = 0;

  for (const loan of loans) {
    // Book details: search local books cache or use nested loan.book if provided by backend
    const book = books.find(b => String(b.id) === String(loan.bookId)) ||
                 loan.book ||
                 { id: loan.bookId, title: loan.bookTitle || `Book #${loan.bookId}`, author: loan.bookAuthor || '' };

    const status = loanStatus(loan.due);
    if (status === 'due-soon') soon++;
    if (status === 'overdue') overdue++;

    const row = $('loan-template').content.cloneNode(true);
    row.querySelector('.loan').classList.add(status);
    row.querySelector('.book-title').textContent = book.title;
    row.querySelector('.book-author').textContent = book.author || '';
    row.querySelector('.loan-due').textContent = loan.due ? `Due ${loan.due}` : 'Active loan';

    const badge = row.querySelector('.loan-status');
    badge.className = `badge loan-status ${status}`;
    badge.textContent = { borrowed: 'Borrowed', 'due-soon': 'Due soon', overdue: 'Overdue' }[status] || 'Borrowed';

    const returnBtn = row.querySelector('.return-btn');
    returnBtn.dataset.id = loan.id ?? loan.bookId;
    returnBtn.dataset.loanId = loan.id ?? '';
    returnBtn.dataset.bookId = loan.bookId;

    list.appendChild(row);
  }

  if ($('stat-borrowed')) $('stat-borrowed').textContent = loans.length;
  if ($('stat-soon')) $('stat-soon').textContent = soon;
  if ($('stat-overdue')) $('stat-overdue').textContent = overdue;
  if ($('no-loans')) $('no-loans').classList.toggle('hidden', loans.length > 0);
}

// ---------- Data Loaders ----------
async function loadBooks() {
  const loadingEl = $('loading');
  const errorEl = $('load-error');
  const gridEl = $('book-grid');
  const noResultsEl = $('no-results');

  if (loadingEl) loadingEl.classList.remove('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (noResultsEl) noResultsEl.classList.add('hidden');

  try {
    const data = await api.getBooks();
    books = data;
    updateGenreFilterChips();
    renderBooks();
    if (errorEl) errorEl.classList.add('hidden');
  } catch (err) {
    console.error('[Lendly] Failed to load books from backend:', err);
    if (errorEl) errorEl.classList.remove('hidden');
    if (gridEl) gridEl.innerHTML = '';
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (gridEl) gridEl.classList.remove('hidden');
  }
}

async function loadLoans() {
  const loadingLoansEl = $('loading-loans');
  const loansErrorEl = $('loans-error');
  if (loadingLoansEl) loadingLoansEl.classList.remove('hidden');
  if (loansErrorEl) loansErrorEl.classList.add('hidden');

  try {
    const data = await api.getLoans(currentAccount.memberId || undefined);
    loans = data;
    renderLoans();
    // Also re-render books to reflect accurate copies left
    renderBooks();
  } catch (err) {
    console.error('[Lendly] Failed to load loans from backend:', err);
    if (loansErrorEl) loansErrorEl.classList.remove('hidden');
    renderLoans();
  } finally {
    if (loadingLoansEl) loadingLoansEl.classList.add('hidden');
  }
}

async function loadAccount() {
  if (!currentAccount.memberId) return;

  try {
    const account = await api.getAccount(currentAccount.memberId);
    if (account && (account.memberId || account.name)) {
      currentAccount = {
        name: account.name ?? currentAccount.name,
        memberId: account.memberId ?? currentAccount.memberId,
        loanLength: Number(account.loanLength) || currentAccount.loanLength || 14,
      };
      saveLocalAccount(currentAccount);
      populateAccountForm();
      updateMemberBadge();
    }
  } catch (err) {
    console.debug('[Lendly] Could not sync account with backend:', err.message);
  }
}

// ---------- Event Listeners ----------

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    ['browse', 'loans', 'account'].forEach(v => {
      const section = $('view-' + v);
      if (section) section.classList.toggle('hidden', v !== tab.dataset.view);
    });

    if (tab.dataset.view === 'loans') {
      loadLoans();
    }
  });
});

// Member badge click navigates to Account tab
$('member-badge')?.addEventListener('click', () => {
  const accountTab = document.querySelector('.tab[data-view="account"]');
  if (accountTab) accountTab.click();
});

// Search input
$('search')?.addEventListener('input', renderBooks);

// Filter chips
$('filters')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  activeFilter = chip.dataset.filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
  renderBooks();
});

// Retry loading books
$('retry-books')?.addEventListener('click', (e) => {
  e.stopPropagation();
  loadBooks();
});

$('load-error')?.addEventListener('click', () => {
  loadBooks();
});

// Borrow flow (Modal)
$('book-grid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.borrow-btn');
  if (!btn || btn.disabled) return;

  pendingBookId = btn.dataset.id;
  const book = books.find(b => String(b.id) === String(pendingBookId));
  if (!book) return;

  const loanDays = Number(currentAccount.loanLength) || 14;
  const weeks = Math.round(loanDays / 7);
  const timeDesc = loanDays % 7 === 0 ? `${weeks} week${weeks > 1 ? 's' : ''}` : `${loanDays} days`;

  $('modal-text').textContent = `"${book.title}" is yours for ${timeDesc}.`;
  $('borrow-modal').classList.remove('hidden');
});

$('modal-cancel')?.addEventListener('click', () => {
  $('borrow-modal').classList.add('hidden');
  pendingBookId = null;
});

$('borrow-modal')?.addEventListener('click', (e) => {
  if (e.target === $('borrow-modal')) {
    $('borrow-modal').classList.add('hidden');
    pendingBookId = null;
  }
});

$('modal-confirm')?.addEventListener('click', async () => {
  if (!pendingBookId) return;
  const confirmBtn = $('modal-confirm');
  const origText = confirmBtn.textContent;

  try {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Borrowing…';

    const loanDays = Number(currentAccount.loanLength) || 14;
    await api.borrowBook({
      bookId: Number(pendingBookId) || pendingBookId,
      memberId: currentAccount.memberId || undefined,
      days: loanDays,
    });

    $('borrow-modal').classList.add('hidden');
    pendingBookId = null;
    showToast('Book borrowed successfully.');

    await Promise.all([loadBooks(), loadLoans()]);
  } catch (err) {
    console.error('[Lendly] Error borrowing book:', err);
    showToast(err.message || 'Failed to borrow book.');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = origText;
  }
});

// Return book flow
$('loan-list')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.return-btn');
  if (!btn || btn.disabled) return;

  const loanId = btn.dataset.loanId || btn.dataset.id;
  const bookId = btn.dataset.bookId;
  const origText = btn.textContent;

  try {
    btn.disabled = true;
    btn.textContent = 'Returning…';

    await api.returnBook({
      loanId: loanId ? (Number(loanId) || loanId) : undefined,
      bookId: bookId ? (Number(bookId) || bookId) : undefined,
      memberId: currentAccount.memberId || undefined,
    });

    showToast('Book returned.');
    await Promise.all([loadBooks(), loadLoans()]);
  } catch (err) {
    console.error('[Lendly] Error returning book:', err);
    showToast(err.message || 'Failed to return book.');
    btn.disabled = false;
    btn.textContent = origText;
  }
});

// Account form submit
$('account-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nameInput = $('name');
  const memberIdInput = $('member-id');
  const loanLengthSelect = $('loan-length');
  const errorSpan = $('member-id-error');
  const submitBtn = $('account-form').querySelector('button[type="submit"]');

  const name = nameInput.value.trim();
  const memberId = memberIdInput.value.trim();
  const loanLength = Number(loanLengthSelect.value) || 14;

  if (!memberId) {
    if (errorSpan) errorSpan.classList.remove('hidden');
    memberIdInput.focus();
    return;
  }
  if (errorSpan) errorSpan.classList.add('hidden');

  const origText = submitBtn.textContent;
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    const payload = { name, memberId, loanLength };
    const saved = await api.saveAccount(payload);

    currentAccount = {
      name: saved?.name ?? name,
      memberId: saved?.memberId ?? memberId,
      loanLength: Number(saved?.loanLength) || loanLength,
    };

    saveLocalAccount(currentAccount);
    updateMemberBadge();
    showToast('Account details saved.');

    // Refresh loans for the updated member ID
    await loadLoans();
  } catch (err) {
    console.error('[Lendly] Error saving account:', err);
    showToast(err.message || 'Failed to save account.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = origText;
  }
});

// ---------- Initialization ----------
async function init() {
  loadLocalAccount();
  populateAccountForm();
  updateMemberBadge();

  await Promise.allSettled([
    loadBooks(),
    loadLoans(),
    loadAccount(),
  ]);
}

init();
