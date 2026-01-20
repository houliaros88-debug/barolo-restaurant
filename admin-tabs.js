const tabButtons = document.querySelectorAll('[data-admin-tab]');
const tabPanels = document.querySelectorAll('[data-admin-panel]');

const setActiveTab = (target) => {
  const tabName = target === 'notes' ? 'notes' : 'bookings';
  tabButtons.forEach((button) => {
    const isActive = button.dataset.adminTab === tabName;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.adminPanel !== tabName;
  });
  if (location.hash !== `#${tabName}`) {
    history.replaceState(null, '', `#${tabName}`);
  }
  document.dispatchEvent(new CustomEvent('admin:tab', { detail: { tab: tabName } }));
};

const initialTab = location.hash === '#notes' ? 'notes' : 'bookings';
setActiveTab(initialTab);

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.adminTab);
  });
});

window.addEventListener('hashchange', () => {
  setActiveTab(location.hash === '#notes' ? 'notes' : 'bookings');
});
