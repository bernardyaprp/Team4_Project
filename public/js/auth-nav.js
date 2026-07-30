(function () {
  const USER_STORAGE_KEY = 'typerush-current-user';

  function initAuthNav() {
    const authLink = document.getElementById('authLink');
    if (!authLink) return;

    const currentUser = localStorage.getItem(USER_STORAGE_KEY);

    if (!currentUser) {
      authLink.textContent = 'Login';
      authLink.href = '/login';
      return;
    }

    authLink.textContent = 'Logout';
    authLink.href = '#';

    authLink.addEventListener('click', async (event) => {
      event.preventDefault();

      try {
        await fetch('/api/logout', { method: 'POST' });
      } catch (error) {
        console.error('Logout request failed', error);
      }

      localStorage.removeItem(USER_STORAGE_KEY);
      window.location.href = '/login';
    });
  }

  document.addEventListener('DOMContentLoaded', initAuthNav);
})();
