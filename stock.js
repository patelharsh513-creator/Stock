import { auth, db } from './src/firebaseConfig.js';
import { authManager } from './src/auth.js';
import { createRouter } from './src/router.js';
import { Navbar } from './src/components/Navbar.js';
import { LoadingSpinner } from './src/components/common/LoadingSpinner.js';
import { LoginPage } from './src/pages/LoginPage.js';
import { DashboardPage } from './src/pages/DashboardPage.js';
import { SettingsPage } from './src/pages/SettingsPage.js';
import { MenuManagementPage } from './src/pages/MenuManagementPage.js';
import { OrderEntryPage } from './src/pages/OrderEntryPage.js';
import { LowStockPage } from './src/pages/LowStockPage.js';
import { ForecastingPage } from './src/pages/ForecastingPage.js';


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const renderNavbar = (currentUser) => {
  const navbarContainer = document.querySelector('nav-container');
  if (navbarContainer) {
    navbarContainer.remove(); // Clear previous navbar
  }

  if (currentUser) {
    const newNavbarContainer = document.createElement('div');
    newNavbarContainer.classList.add('nav-container'); // Add a class for easier targeting
    rootElement.prepend(newNavbarContainer);
    Navbar(newNavbarContainer, currentUser);
  }
};

const renderPage = async (path) => {
  rootElement.innerHTML = ''; // Clear existing content for the main area
  const mainContent = document.createElement('main');
  mainContent.className = 'flex-grow container mx-auto p-4 md:p-6 lg:p-8';
  rootElement.appendChild(mainContent);

  const currentUser = authManager.getCurrentUser();
  const isLoading = authManager.getLoading();

  // If loading, show spinner regardless of route
  if (isLoading) {
    mainContent.innerHTML = ''; // Clear any loading indicator from previous render
    const spinnerWrapper = document.createElement('div');
    spinnerWrapper.className = 'flex items-center justify-center min-h-screen';
    LoadingSpinner(spinnerWrapper);
    mainContent.appendChild(spinnerWrapper);
    return;
  }

  // Handle redirects and private routes
  if (path !== '#/login' && !currentUser) {
    window.location.hash = '#/login';
    return;
  }
  if (path === '#/' || path === '') {
    window.location.hash = '#/dashboard';
    return;
  }
  if (path === '#/login' && currentUser) {
    window.location.hash = '#/dashboard';
    return;
  }

  // Render Navbar if user is logged in
  renderNavbar(currentUser);

  // Render page content
  switch (path) {
    case '#/login':
      LoginPage(mainContent);
      break;
    case '#/dashboard':
      DashboardPage(mainContent);
      break;
    case '#/settings':
      SettingsPage(mainContent);
      break;
    case '#/menu-management':
      MenuManagementPage(mainContent);
      break;
    case '#/order-entry':
      OrderEntryPage(mainContent);
      break;
    case '#/low-stock':
      LowStockPage(mainContent);
      break;
    case '#/forecasting':
      ForecastingPage(mainContent);
      break;
    default:
      // Fallback for unknown routes, redirect to dashboard or login
      window.location.hash = currentUser ? '#/dashboard' : '#/login';
      break;
  }
};

// Initialize router
const router = createRouter(renderPage);

// Listen to auth state changes to re-render UI elements (like Navbar) and enforce private routes
authManager.onAuthChange((user) => {
  renderNavbar(user); // Re-render navbar on auth state change
  router.navigate(window.location.hash); // Re-evaluate current route access
});

// Initial render
document.addEventListener('DOMContentLoaded', () => {
  router.navigate(window.location.hash || '#/dashboard');
});
