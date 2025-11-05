// Firebase SDK imports from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { 
  getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where, Timestamp, getDoc 
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";


// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCqLcMi1XdfkKVRijHtvpXNyy06oWyfmRg",
  authDomain: "stock-f24.firebaseapp.com",
  projectId: "stock-f24",
  storageBucket: "stock-f24.firebasestorage.app",
  messagingSenderId: "399079555801",
  appId: "1:399079555801:web:2b06e9d9687335b21974c8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Auth Service --- (formerly src/services/firebaseService.js part)
const authService = {
  login: async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      return {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
      };
    } catch (error) {
      console.error('Firebase login error:', error);
      throw error;
    }
  },

  logout: async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Firebase logout error:', error);
      throw error;
    }
  },

  getCurrentUser: () => {
    return auth.currentUser;
  },
};

// --- Firestore Services --- (formerly src/services/firebaseService.js part)

// --- Inventory Management ---
const inventoryCollection = collection(db, 'inventory');

// Function to convert raw JSON inventory data to a clean InventoryItem array
const parseInventoryJson = (jsonData) => {
  return jsonData.map((item) => ({
    id: item.stock_item_id,
    ingredient_id: item.ingredient_id,
    ingredient_name: item.ingredient_name,
    name: item.name,
    ingredient_simplified_name: item.ingredient_simplified_name,
    package_description: item.package_description,
    brand: item.brand,
    par: item.par,
    minimum_quantity_required: item.minimum_quantity_required,
    storage_location: item.storage_location,
    stock_value: item.stock_value,
    quantity: item.quantity, // Keep as string or convert to number if needed for calculation
    last_delivery_date: item.last_delivery_date,
    shelf_life: item.shelf_life,
    outstanding_orders_quantity: item.outstanding_orders_quantity,
    is_negative: item.is_negative,
    is_active: item.is_active,
    is_stockable: item.is_stockable,
    last_counted_date: item.last_counted_date,
    actions: item.actions,
    DT_RowData: item.DT_RowData,
    DT_RowId: item.DT_RowId,
  }));
};

const inventoryService = {
  addOrUpdateInventoryItems: async (
    items
  ) => {
    for (const item of items) {
      const itemRef = doc(inventoryCollection, String(item.id));
      await setDoc(itemRef, item, { merge: true });
    }
  },

  getInventoryItems: async () => {
    const snapshot = await getDocs(inventoryCollection);
    return snapshot.docs.map((doc) => doc.data());
  },

  getInventoryItemById: async (id) => {
    const itemRef = doc(inventoryCollection, String(id));
    const docSnap = await getDoc(itemRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  },

  updateInventoryItemQuantity: async (
    id,
    newQuantity
  ) => {
    const itemRef = doc(inventoryCollection, String(id));
    await updateDoc(itemRef, { quantity: String(newQuantity) }); // Store as string as per JSON structure
  },

  // Update multiple fields for an inventory item
  updateInventoryItem: async (
    id,
    updates
  ) => {
    const itemRef = doc(inventoryCollection, String(id));
    await updateDoc(itemRef, updates);
  },

  deleteInventoryItem: async (id) => {
    const itemRef = doc(inventoryCollection, String(id));
    await deleteDoc(itemRef);
  },

  importInventoryJson: async (jsonString) => {
    try {
      const rawData = JSON.parse(jsonString);
      const parsedItems = parseInventoryJson(rawData);
      await inventoryService.addOrUpdateInventoryItems(parsedItems);
    } catch (error) {
      console.error('Error importing inventory JSON:', error);
      throw new Error('Failed to import inventory. Check JSON format.');
    }
  },
};

// --- Dish Management ---
const dishesCollection = collection(db, 'dishes');

const parseDishJson = (jsonData) => {
  // Directly use the 'dishes' array from the top-level object
  return jsonData.dishes.map((dish) => {
    // Add any necessary transformations here
    return {
      ...dish,
      // You might want to process ingredients here to flatten sub-recipes for easier access
      // For now, we'll keep the nested structure as is from the JSON.
      // Flattening can happen when calculating requirements.
    };
  });
};

const dishService = {
  addOrUpdateDishes: async (dishes) => {
    for (const dish of dishes) {
      const dishRef = doc(dishesCollection, dish.id);
      await setDoc(dishRef, dish, { merge: true });
    }
  },

  getDishes: async () => {
    const snapshot = await getDocs(dishesCollection);
    return snapshot.docs.map((doc) => doc.data());
  },

  getDishById: async (id) => {
    const dishRef = doc(dishesCollection, id);
    const docSnap = await getDoc(dishRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  },

  deleteDish: async (id) => {
    const dishRef = doc(dishesCollection, id);
    await deleteDoc(dishRef);
  },

  importDishJson: async (jsonString) => {
    try {
      const rawData = JSON.parse(jsonString);
      // Assuming the top-level JSON contains a 'dishes' array
      if (!rawData.dishes || !Array.isArray(rawData.dishes)) {
        throw new Error('Invalid dish JSON format: missing "dishes" array.');
      }
      const parsedDishes = parseDishJson(rawData);
      await dishService.addOrUpdateDishes(parsedDishes);
    } catch (error) {
      console.error('Error importing dish JSON:', error);
      throw new Error('Failed to import dishes. Check JSON format.');
    }
  },

  // Helper to get all primary ingredients and their total quantities for a given dish
  getFlattenedIngredientsForDish: async (
    dishId
  ) => {
    const dish = await dishService.getDishById(dishId);
    if (!dish) {
      return new Map();
    }

    const flattened = new Map(); // ingredient.id -> DishIngredient (with aggregated amount)
    const processIngredients = (ingredients) => {
      for (const item of ingredients) {
        if (item.subRecipe) {
          processIngredients(item.subRecipe.ingredients);
        } else if (item.ingredient) {
          // Use item.ingredient.id for lookup, assuming it corresponds to InventoryItem.ingredient_id
          const ingredientIdentifier = item.ingredient.id;
          const currentAmount = flattened.get(ingredientIdentifier)?.amount || 0;
          flattened.set(ingredientIdentifier, {
            ...item,
            amount: currentAmount + item.amount,
          });
        }
      }
    };

    processIngredients(dish.ingredients);
    return flattened;
  },
};

// --- Weekly Menu Management ---
const weeklyMenusCollection = collection(db, 'weeklyMenus');

const weeklyMenuService = {
  addWeeklyMenu: async (menu) => {
    const newMenuRef = doc(weeklyMenusCollection);
    const menuWithTimestamps = {
      ...menu,
      id: newMenuRef.id,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await setDoc(newMenuRef, menuWithTimestamps);
    return newMenuRef.id;
  },

  getWeeklyMenus: async () => {
    const snapshot = await getDocs(weeklyMenusCollection);
    return snapshot.docs.map((doc) => doc.data());
  },

  getWeeklyMenuById: async (id) => {
    const docSnap = await getDoc(doc(weeklyMenusCollection, id));
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  },

  getWeeklyMenuForDate: async (date) => {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    const q = query(
      weeklyMenusCollection,
      where('startDate', '<=', Timestamp.fromDate(endOfDay)),
      where('endDate', '>=', Timestamp.fromDate(startOfDay))
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      // Assuming only one menu active per date
      return querySnapshot.docs[0].data();
    }
    return null;
  },

  updateWeeklyMenu: async (id, updates) => {
    const menuRef = doc(weeklyMenusCollection, id);
    await updateDoc(menuRef, { ...updates, updatedAt: Timestamp.now() });
  },

  deleteWeeklyMenu: async (id) => {
    const menuRef = doc(weeklyMenusCollection, id);
    await deleteDoc(menuRef);
  },
};

// --- Daily Order Management ---
const dailyOrdersCollection = collection(db, 'dailyOrders');

const dailyOrderService = {
  addDailyOrder: async (order) => {
    const newOrderRef = doc(dailyOrdersCollection);
    const orderWithTimestamps = {
      ...order,
      id: newOrderRef.id,
      createdAt: Timestamp.now(),
    };
    await setDoc(newOrderRef, orderWithTimestamps);
    return newOrderRef.id;
  },

  getDailyOrders: async () => {
    const snapshot = await getDocs(dailyOrdersCollection);
    return snapshot.docs.map((doc) => doc.data());
  },

  getDailyOrderForDateAndMenu: async (date, menuId) => {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    const q = query(
      dailyOrdersCollection,
      where('date', '>=', Timestamp.fromDate(startOfDay)),
      where('date', '<=', Timestamp.fromDate(endOfDay)),
      where('menuId', '==', menuId)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data();
    }
    return null;
  },

  updateDailyOrder: async (id, updates) => {
    const orderRef = doc(dailyOrdersCollection, id);
    await updateDoc(orderRef, updates);
  },

  deleteDailyOrder: async (id) => {
    const orderRef = doc(dailyOrdersCollection, id);
    await deleteDoc(orderRef);
  },
};

// --- Forecasting & Low Stock Utility ---
const calculationService = {
  // Aggregates total ingredient requirements from a list of daily orders
  getAggregatedIngredientRequirements: async (
    dailyOrders,
    dishes
  ) => {
    const aggregatedRequirements = new Map(); // ingredient.id -> total amount needed

    for (const order of dailyOrders) {
      for (const dailyDishOrder of order.dishOrders) {
        const dish = dishes.find((d) => d.id === dailyDishOrder.dishId);
        if (dish) {
          const flattenedIngredients = await dishService.getFlattenedIngredientsForDish(dish.id);
          flattenedIngredients.forEach((ingredient, ingredientId) => {
            const totalAmountNeeded = ingredient.amount * dailyDishOrder.orderedQuantity;
            const currentAggregated = aggregatedRequirements.get(ingredientId) || 0;
            aggregatedRequirements.set(ingredientId, currentAggregated + totalAmountNeeded);
          });
        }
      }
    }
    return aggregatedRequirements;
  },

  // Determines what needs to be ordered to meet forecasted demand and thresholds
  getForecastOrderSuggestions: async (
    aggregatedRequirements,
    currentInventory
  ) => {
    const suggestions = [];

    for (const [ingredientId, requiredAmount] of aggregatedRequirements.entries()) {
      const inventoryItem = currentInventory.find(item => item.ingredient_id === Number(ingredientId) || item.id === Number(ingredientId));

      if (inventoryItem) {
        const currentStockNum = parseFloat(inventoryItem.quantity || '0');
        const minThresholdNum = parseFloat(inventoryItem.minimum_quantity_required || '0');
        
        let toOrder = 0;
        // If current stock + outstanding orders is less than required, order the difference
        // Also consider bringing stock up to at least the minimum threshold
        const buffer = minThresholdNum > requiredAmount ? minThresholdNum : requiredAmount; // Ensure we order at least up to threshold or immediate need

        if (currentStockNum < buffer) {
          toOrder = buffer - currentStockNum;
        }

        if (toOrder > 0) {
          suggestions.push({
            ingredientId: String(inventoryItem.id), // Use inventory item's ID for linking
            ingredientName: inventoryItem.name,
            currentStock: currentStockNum,
            requiredAmount: requiredAmount,
            toOrder: toOrder,
            unit: (inventoryItem.package_description && inventoryItem.package_description.split(' ')[1]) || 'units' // Attempt to extract unit
          });
        }
      } else {
        // Ingredient in dish not found in inventory - needs to be ordered
        // This is a simplified approach, may need more info on default order quantities
        const genericUnit = 'units'; // Default unit if not found
        suggestions.push({
          ingredientId: ingredientId,
          ingredientName: `Unknown Ingredient (ID: ${ingredientId})`, // Placeholder name
          currentStock: 0,
          requiredAmount: requiredAmount,
          toOrder: requiredAmount,
          unit: genericUnit
        });
      }
    }
    return suggestions;
  },
};


// --- Auth Manager --- (formerly src/auth.js)

let currentUser = null;
let loading = true;
const authChangeListeners = [];

const notifyAuthChange = () => {
  authChangeListeners.forEach(listener => listener(currentUser));
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    };
  } else {
    currentUser = null;
  }
  loading = false;
  notifyAuthChange();
});

const authManager = {
  getCurrentUser: () => currentUser,
  getLoading: () => loading,
  login: async (email, password) => {
    loading = true;
    notifyAuthChange(); // Notify loading state
    try {
      const user = await authService.login(email, password);
      // onAuthStateChanged will update currentUser and loading, then notify
      return user;
    } finally {
      // If login fails, onAuthStateChanged might not fire for currentUser change
      // but loading should revert.
      // This is handled by the onAuthStateChanged listener eventually.
      // For immediate feedback, setting loading=false here might be desired,
      // but onAuthStateChanged is the source of truth.
    }
  },
  logout: async () => {
    loading = true;
    notifyAuthChange(); // Notify loading state
    try {
      await authService.logout();
      // onAuthStateChanged will update currentUser and loading, then notify
    } finally {
      // Similar to login, onAuthStateChanged is the source of truth.
    }
  },
  onAuthChange: (listener) => {
    authChangeListeners.push(listener);
    // Immediately notify with current state
    listener(currentUser);
    // Return unsubscribe function
    return () => {
      const index = authChangeListeners.indexOf(listener);
      if (index > -1) {
        authChangeListeners.splice(index, 1);
      }
    };
  }
};


// --- Router --- (formerly src/router.js)

const createRouter = (renderPageCallback) => {
  const navigate = (path) => {
    if (window.location.hash !== path) {
      window.location.hash = path;
    } else {
      renderPageCallback(path); // Manually trigger render if hash hasn't changed
    }
  };

  window.addEventListener('hashchange', () => {
    renderPageCallback(window.location.hash);
  });

  return { navigate };
};


// --- Common Components ---

// Button (formerly src/components/common/Button.js)
const Button = (parent, { variant = 'primary', size = 'medium', children, className = '', loading = false, disabled = false, onClick, type = 'button', ...props }) => {
  const button = document.createElement('button');
  button.type = type;

  const baseStyles = 'font-semibold rounded-md transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-opacity-75';
  let variantStyles = '';
  let sizeStyles = '';

  switch (variant) {
    case 'primary':
      variantStyles = 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500';
      break;
    case 'secondary':
      variantStyles = 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400';
      break;
    case 'danger':
      variantStyles = 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500';
      break;
    case 'outline':
      variantStyles = 'bg-transparent border border-blue-600 text-blue-600 hover:bg-blue-50 focus:ring-blue-500';
      break;
  }

  switch (size) {
    case 'small':
      sizeStyles = 'px-3 py-1 text-sm';
      break;
    case 'medium':
      sizeStyles = 'px-4 py-2 text-base';
      break;
    case 'large':
      sizeStyles = 'px-6 py-3 text-lg';
      break;
  }

  button.className = `${baseStyles} ${variantStyles} ${sizeStyles} ${className} ${
    (disabled || loading) ? 'opacity-50 cursor-not-allowed' : ''
  }`;
  button.disabled = disabled || loading;

  if (loading) {
    const spinnerSpan = document.createElement('span');
    spinnerSpan.className = 'flex items-center justify-center';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.className = 'animate-spin h-5 w-5 text-white mr-3';
    svg.setAttribute('viewBox', '0 0 24 24');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.className = 'opacity-25';
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '4');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.className = 'opacity-75';
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z');

    svg.appendChild(circle);
    svg.appendChild(path);
    spinnerSpan.appendChild(svg);
    spinnerSpan.appendChild(document.createTextNode('Loading...'));
    button.appendChild(spinnerSpan);
  } else {
    if (typeof children === 'string') {
      button.textContent = children;
    } else if (children instanceof HTMLElement) {
      button.appendChild(children);
    } else if (Array.isArray(children)) {
      children.forEach(child => {
        if (typeof child === 'string') {
          button.appendChild(document.createTextNode(child));
        } else if (child instanceof HTMLElement) {
          button.appendChild(child);
        }
      });
    }
  }

  if (onClick) {
    button.addEventListener('click', onClick);
  }

  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      button.setAttribute(key, props[key]);
    }
  }

  parent.appendChild(button);
  return button;
};

// Input (formerly src/components/common/Input.js)
const Input = (parent, { label, id, error, className = '', onChange, value, type = 'text', ...props }) => {
  const div = document.createElement('div');
  div.className = 'mb-4';

  if (label) {
    const labelElement = document.createElement('label');
    labelElement.htmlFor = id;
    labelElement.className = 'block text-sm font-medium text-gray-700 mb-1';
    labelElement.textContent = label;
    div.appendChild(labelElement);
  }

  const inputElement = document.createElement('input');
  inputElement.id = id;
  inputElement.type = type;
  inputElement.value = value !== undefined ? value : '';
  inputElement.className = `mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${className} ${
    error ? 'border-red-500' : ''
  }`;

  if (onChange) {
    inputElement.addEventListener('input', onChange);
  }

  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      inputElement.setAttribute(key, props[key]);
    }
  }

  div.appendChild(inputElement);

  if (error) {
    const errorParagraph = document.createElement('p');
    errorParagraph.className = 'mt-1 text-sm text-red-600';
    errorParagraph.textContent = error;
    div.appendChild(errorParagraph);
  }

  parent.appendChild(div);
  return inputElement;
};

// LoadingSpinner (formerly src/components/common/LoadingSpinner.js)
const LoadingSpinner = (parent) => {
  const div = document.createElement('div');
  div.className = 'flex items-center justify-center';

  const spinner = document.createElement('div');
  spinner.className = 'animate-spin rounded-full h-12 w-12 border-b-4 border-blue-500';

  div.appendChild(spinner);
  parent.appendChild(div);
  return div;
};


// --- Components ---

// Navbar (formerly src/components/Navbar.js)
const Navbar = (parent, currentUser) => {
  parent.innerHTML = ''; // Clear existing content

  const nav = document.createElement('nav');
  nav.className = 'bg-gradient-to-r from-blue-600 to-indigo-700 p-4 shadow-lg sticky top-0 z-50';

  const container = document.createElement('div');
  container.className = 'container mx-auto flex flex-wrap justify-between items-center';

  const brandLink = document.createElement('a');
  brandLink.href = '#/dashboard';
  brandLink.className = 'text-white text-2xl font-bold tracking-wide hover:text-gray-200 transition-colors duration-200';
  brandLink.textContent = 'KitchenPro';
  container.appendChild(brandLink);

  if (currentUser) {
    const rightSection = document.createElement('div');
    rightSection.className = 'flex items-center space-x-4';

    const navList = document.createElement('ul');
    navList.className = 'flex flex-wrap space-x-4';

    const navItems = [
      { name: 'Dashboard', path: '#/dashboard' },
      { name: 'Menu Management', path: '#/menu-management' },
      { name: 'Order Entry', path: '#/order-entry' },
      { name: 'Low Stock', path: '#/low-stock' },
      { name: 'Forecasting', path: '#/forecasting' },
      { name: 'Settings', path: '#/settings' },
    ];

    navItems.forEach(item => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = item.path;
      link.textContent = item.name;
      link.className = 'text-white hover:text-blue-200 transition-colors duration-200 px-3 py-1 rounded-md';

      // Simple active state check for vanilla JS
      const updateActiveClass = () => {
        if (window.location.hash === item.path) {
          link.classList.add('bg-blue-700', 'text-blue-100');
        } else {
          link.classList.remove('bg-blue-700', 'text-blue-100');
        }
      };
      updateActiveClass();
      window.addEventListener('hashchange', updateActiveClass);

      li.appendChild(link);
      navList.appendChild(li);
    });

    rightSection.appendChild(navList);

    const welcomeSpan = document.createElement('span');
    welcomeSpan.className = 'text-blue-100 hidden sm:inline';
    welcomeSpan.textContent = `Hello, ${currentUser.email?.split('@')[0]}`;
    rightSection.appendChild(welcomeSpan);

    const logoutButtonWrapper = document.createElement('div'); // Wrapper for Button component
    Button(logoutButtonWrapper, {
      onClick: async () => {
        await authManager.logout();
        window.location.hash = '#/login'; // Redirect after logout
      },
      variant: 'secondary',
      size: 'small',
      className: 'bg-blue-500 hover:bg-blue-400 text-white',
      children: 'Logout'
    });
    rightSection.appendChild(logoutButtonWrapper);


    container.appendChild(rightSection);
  }

  nav.appendChild(container);
  parent.appendChild(nav);
  return nav;
};

// DishCard (formerly src/components/DishCard.js)
const DishCard = (parent, { dish, onQuantityChange, currentOrderQuantity = 0, showDetailsInitially = false }) => {
  let showDetails = showDetailsInitially;
  let loadingIngredients = false;
  let flattenedIngredients = null;

  const getUnit = (pkgDesc) => {
    if (!pkgDesc) return 'units';
    const match = String(pkgDesc).match(/(\d+\.?\d*)\s*(kg|g|ml|l|piece|pcs|pack|bottle|box)/i);
    return match ? match[2] : 'units';
  };

  const renderCard = (container) => {
    container.innerHTML = ''; // Clear previous content

    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg shadow-md p-4 mb-4 border border-gray-200';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between cursor-pointer';
    header.addEventListener('click', toggleDetails);
    card.appendChild(header);

    const leftHeader = document.createElement('div');
    leftHeader.className = 'flex items-center';
    header.appendChild(leftHeader);

    const img = document.createElement('img');
    img.src = dish.webUrl || `https://picsum.photos/80/80?random=${dish.id}`;
    img.alt = dish.variantName;
    img.className = 'w-16 h-16 object-cover rounded-md mr-4';
    leftHeader.appendChild(img);

    const textDiv = document.createElement('div');
    leftHeader.appendChild(textDiv);

    const h3 = document.createElement('h3');
    h3.className = 'text-lg font-semibold text-gray-800';
    h3.innerHTML = `${dish.variantName} <span class="text-sm text-gray-500">(${dish.diet} - ${dish.type})</span>`;
    textDiv.appendChild(h3);

    const pCategory = document.createElement('p');
    pCategory.className = 'text-sm text-gray-600';
    pCategory.textContent = `Category: ${dish.category.name}`;
    textDiv.appendChild(pCategory);

    const rightHeader = document.createElement('div');
    rightHeader.className = 'flex items-center';
    header.appendChild(rightHeader);

    if (onQuantityChange) {
      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.min = '0';
      quantityInput.value = currentOrderQuantity;
      quantityInput.className = 'w-20 px-2 py-1 border border-gray-300 rounded-md text-center mr-4';
      quantityInput.setAttribute('aria-label', `Quantity for ${dish.variantName}`);
      quantityInput.addEventListener('change', handleQuantityChange);
      quantityInput.addEventListener('click', (e) => e.stopPropagation()); // Prevent card click
      rightHeader.appendChild(quantityInput);
    }

    const toggleButton = document.createElement('button');
    toggleButton.className = 'text-blue-600 hover:text-blue-800 transition-colors duration-200';
    toggleButton.setAttribute('aria-expanded', showDetails);
    toggleButton.setAttribute('aria-controls', `dish-details-${dish.id}`);
    toggleButton.innerHTML = showDetails
      ? `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>`
      : `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
    rightHeader.appendChild(toggleButton);

    if (showDetails) {
      const detailsDiv = document.createElement('div');
      detailsDiv.id = `dish-details-${dish.id}`;
      detailsDiv.className = 'mt-4 pt-4 border-t border-gray-200';
      card.appendChild(detailsDiv);

      const h4Nutritional = document.createElement('h4');
      h4Nutritional.className = 'font-semibold text-gray-700 mb-2';
      h4Nutritional.textContent = 'Nutritional Info:';
      detailsDiv.appendChild(h4Nutritional);

      const ulNutritional = document.createElement('ul');
      ulNutritional.className = 'text-sm text-gray-600 list-disc list-inside mb-4';
      ulNutritional.innerHTML = `
        <li>Calories: ${dish.nutritionalInfo.totalCalories.toFixed(2)} kcal</li>
        <li>Fat: ${dish.nutritionalInfo.fat.toFixed(2)}g</li>
        <li>Carbs: ${dish.nutritionalInfo.carbohydrates.toFixed(2)}g</li>
        <li>Protein: ${dish.nutritionalInfo.protein.toFixed(2)}g</li>
        <li>Salt: ${dish.nutritionalInfo.salt.toFixed(2)}g</li>
      `;
      detailsDiv.appendChild(ulNutritional);

      const h4Allergens = document.createElement('h4');
      h4Allergens.className = 'font-semibold text-gray-700 mb-2';
      h4Allergens.textContent = 'Allergens:';
      detailsDiv.appendChild(h4Allergens);

      if (dish.allergens && dish.allergens.length > 0) {
        const ulAllergens = document.createElement('ul');
        ulAllergens.className = 'text-sm text-red-600 list-disc list-inside mb-4';
        dish.allergens.forEach(allergen => {
          const li = document.createElement('li');
          li.textContent = allergen.name;
          ulAllergens.appendChild(li);
        });
        detailsDiv.appendChild(ulAllergens);
      } else {
        const pAllergens = document.createElement('p');
        pAllergens.className = 'text-sm text-gray-600 mb-4';
        pAllergens.textContent = 'No major allergens.';
        detailsDiv.appendChild(pAllergens);
      }

      const h4Ingredients = document.createElement('h4');
      h4Ingredients.className = 'font-semibold text-gray-700 mb-2';
      h4Ingredients.textContent = 'Ingredients:';
      detailsDiv.appendChild(h4Ingredients);

      if (loadingIngredients) {
        LoadingSpinner(detailsDiv);
      } else if (flattenedIngredients && flattenedIngredients.size > 0) {
        const ulIngredients = document.createElement('ul');
        ulIngredients.className = 'text-sm text-gray-600 list-disc list-inside';
        Array.from(flattenedIngredients.values()).forEach(ingredient => {
          const li = document.createElement('li');
          li.textContent = `${ingredient.name}: ${ingredient.amount} ${getUnit(ingredient.ingredient?.package_description || ingredient.subRecipe?.portion)}`;
          ulIngredients.appendChild(li);
        });
        detailsDiv.appendChild(ulIngredients);
      } else {
        const pIngredients = document.createElement('p');
        pIngredients.className = 'text-sm text-gray-600';
        pIngredients.textContent = 'No detailed ingredients available or loading failed.';
        detailsDiv.appendChild(pIngredients);
      }
    }
    container.appendChild(card);
  };

  const toggleDetails = async () => {
    if (!showDetails && !flattenedIngredients) {
      loadingIngredients = true;
      renderCard(parent); // Re-render to show loading spinner
      try {
        flattenedIngredients = await dishService.getFlattenedIngredientsForDish(dish.id);
      } catch (error) {
        console.error('Failed to load flattened ingredients:', error);
      } finally {
        loadingIngredients = false;
      }
    }
    showDetails = !showDetails;
    renderCard(parent); // Re-render to show/hide details
  };

  const handleQuantityChange = (e) => {
    const quantity = parseInt(e.target.value, 10);
    if (onQuantityChange) {
      onQuantityChange(dish.id, isNaN(quantity) ? 0 : quantity);
    }
  };

  renderCard(parent);
};


// --- Pages ---

// DashboardPage (formerly src/pages/DashboardPage.js)
const DashboardPage = (container) => {
  container.innerHTML = ''; // Clear existing content

  const pageDiv = document.createElement('div');
  pageDiv.className = 'p-4 md:p-8';
  container.appendChild(pageDiv);

  const h1 = document.createElement('h1');
  h1.className = 'text-4xl font-extrabold text-gray-900 mb-8 text-center';
  h1.textContent = 'Dashboard';
  pageDiv.appendChild(h1);

  const p = document.createElement('p');
  p.className = 'text-lg text-gray-700 mb-10 text-center max-w-2xl mx-auto';
  p.textContent = 'Welcome to your Cloud Kitchen Manager! Quickly navigate through essential tasks to keep your kitchen running smoothly.';
  pageDiv.appendChild(p);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
  pageDiv.appendChild(cardsContainer);

  const cardsData = [
    { title: 'Manage Menu', description: 'Plan and update your weekly menu.', link: '#/menu-management', icon: '🍽️' },
    { title: 'Enter Orders', description: 'Log daily orders from your kitchen team.', link: '#/order-entry', icon: '📝' },
    { title: 'Low Stock Alerts', description: 'View ingredients running low.', link: '#/low-stock', icon: '⚠️' },
    { title: 'Forecasting', description: 'Predict ingredient needs for future weeks.', link: '#/forecasting', icon: '📈' },
    { title: 'Settings & Import', description: 'Update inventory and dish data.', link: '#/settings', icon: '⚙️' },
  ];

  cardsData.forEach(cardData => {
    const cardLink = document.createElement('a');
    cardLink.href = cardData.link;
    cardLink.className = 'flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-200';
    cardLink.setAttribute('role', 'link');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'text-5xl mb-4';
    iconSpan.textContent = cardData.icon;
    cardLink.appendChild(iconSpan);

    const h2 = document.createElement('h2');
    h2.className = 'text-2xl font-bold text-gray-800 mb-2 text-center';
    h2.textContent = cardData.title;
    cardLink.appendChild(h2);

    const pDesc = document.createElement('p');
    pDesc.className = 'text-md text-gray-600 text-center';
    pDesc.textContent = cardData.description;
    cardLink.appendChild(pDesc);

    cardsContainer.appendChild(cardLink);
  });
};

// ForecastingPage (formerly src/pages/ForecastingPage.js)
const ForecastingPage = (container) => {
  let weeklyMenus = [];
  let allDailyOrders = [];
  let allDishes = [];
  let allInventory = [];
  let loading = true;
  let error = null;
  let selectedMenuId = '';
  let forecastResults = [];
  let filterText = '';

  const renderPage = async () => {
    container.innerHTML = ''; // Clear previous content

    if (loading) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'flex flex-col items-center justify-center p-8 bg-white rounded-lg shadow-md';
      LoadingSpinner(loadingDiv);
      const p = document.createElement('p');
      p.className = 'mt-4 text-gray-700';
      p.textContent = 'Loading forecasting data...';
      loadingDiv.appendChild(p);
      container.appendChild(loadingDiv);
      return;
    }

    if (error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'text-center p-4 bg-red-100 text-red-700 rounded-md';
      const p = document.createElement('p');
      p.textContent = `Error: ${error}`;
      errorDiv.appendChild(p);
      const retryButtonWrapper = document.createElement('div');
      Button(retryButtonWrapper, { onClick: fetchData, className: 'mt-4', children: 'Retry' });
      errorDiv.appendChild(retryButtonWrapper);
      container.appendChild(errorDiv);
      return;
    }

    const pageDiv = document.createElement('div');
    pageDiv.className = 'p-4 md:p-8 bg-white rounded-lg shadow-md';
    container.appendChild(pageDiv);

    const h1 = document.createElement('h1');
    h1.className = 'text-4xl font-bold text-gray-900 mb-6 text-center';
    h1.textContent = 'Ingredient Forecasting';
    pageDiv.appendChild(h1);

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'mb-6 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4';
    pageDiv.appendChild(controlsDiv);

    const menuSelectDiv = document.createElement('div');
    menuSelectDiv.className = 'w-full md:w-1/2';
    controlsDiv.appendChild(menuSelectDiv);

    const labelSelectMenu = document.createElement('label');
    labelSelectMenu.htmlFor = 'select-menu';
    labelSelectMenu.className = 'block text-sm font-medium text-gray-700 mb-1';
    labelSelectMenu.textContent = 'Select Weekly Menu for Forecast:';
    menuSelectDiv.appendChild(labelSelectMenu);

    const selectMenu = document.createElement('select');
    selectMenu.id = 'select-menu';
    selectMenu.value = selectedMenuId;
    selectMenu.className = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm';
    selectMenu.addEventListener('change', (e) => {
      selectedMenuId = e.target.value;
      calculateForecast();
    });
    menuSelectDiv.appendChild(selectMenu);

    if (weeklyMenus.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No menus available';
      selectMenu.appendChild(option);
    } else {
      weeklyMenus
        .sort((a, b) => b.startDate.toDate().getTime() - a.startDate.toDate().getTime())
        .forEach(menu => {
          const option = document.createElement('option');
          option.value = menu.id;
          option.textContent = `${menu.name} (${formatDate(menu.startDate)} - ${formatDate(menu.endDate)})`;
          selectMenu.appendChild(option);
        });
    }

    const filterInputDiv = document.createElement('div');
    filterInputDiv.className = 'w-full md:w-1/2';
    Input(filterInputDiv, {
      id: 'filter-ingredients',
      label: 'Filter Ingredients',
      type: 'text',
      value: filterText,
      onChange: (e) => {
        filterText = e.target.value;
        renderForecastTable(); // Only re-render the table for filtering
      },
      placeholder: 'Search by ingredient name',
      className: 'w-full'
    });
    controlsDiv.appendChild(filterInputDiv);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'overflow-x-auto';
    pageDiv.appendChild(tableContainer);

    const renderForecastTable = () => {
      tableContainer.innerHTML = ''; // Clear existing table content

      const filteredForecastResults = forecastResults.filter(result =>
        result.ingredientName.toLowerCase().includes(filterText.toLowerCase())
      );

      if (filteredForecastResults.length > 0) {
        const table = document.createElement('table');
        table.className = 'min-w-full bg-white border border-gray-200 divide-y divide-gray-200';
        tableContainer.appendChild(table);

        const thead = document.createElement('thead');
        thead.className = 'bg-gray-50';
        thead.innerHTML = `
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ingredient</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stock</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Required for Menu</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount to Order</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
          </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        tbody.className = 'bg-white divide-y divide-gray-200';
        table.appendChild(tbody);

        filteredForecastResults.forEach(result => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${result.ingredientName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${result.currentStock.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${result.requiredAmount.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">${result.toOrder.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${result.unit}</td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        const p = document.createElement('p');
        p.className = 'text-center text-gray-600 mt-8';
        p.textContent = selectedMenuId && weeklyMenus.length > 0 && !authManager.getLoading()
          ? 'No orders found for the selected menu or no ingredients to order.'
          : 'Select a weekly menu to see the ingredient forecast.';
        tableContainer.appendChild(p);
      }
    };
    renderForecastTable();
  };

  const fetchData = async () => {
    loading = true;
    error = null;
    renderPage();
    try {
      const menus = await weeklyMenuService.getWeeklyMenus();
      const orders = await dailyOrderService.getDailyOrders();
      const dishes = await dishService.getDishes();
      const inventory = await inventoryService.getInventoryItems();

      weeklyMenus = menus;
      allDailyOrders = orders;
      allDishes = dishes;
      allInventory = inventory;

      if (menus.length > 0) {
        const sortedMenus = [...menus].sort((a, b) => b.startDate.toDate().getTime() - a.startDate.toDate().getTime());
        selectedMenuId = sortedMenus[0].id || '';
      }
    } catch (err) {
      console.error('Error fetching data for forecasting:', err);
      error = 'Failed to load data for forecasting.';
    } finally {
      loading = false;
      await calculateForecast(); // Calculate forecast after fetching all data and setting selectedMenuId
      renderPage();
    }
  };

  const calculateForecast = async () => {
    if (!selectedMenuId || allDailyOrders.length === 0 || allDishes.length === 0 || allInventory.length === 0) {
      forecastResults = [];
      return;
    }

    loading = true;
    error = null;
    renderPage(); // Show loading state
    try {
      const relevantDailyOrders = allDailyOrders.filter(order => order.menuId === selectedMenuId);

      if (relevantDailyOrders.length === 0) {
        forecastResults = [];
        loading = false;
        renderPage();
        return;
      }

      const aggregatedRequirements = await calculationService.getAggregatedIngredientRequirements(
        relevantDailyOrders,
        allDishes
      );

      const suggestions = await calculationService.getForecastOrderSuggestions(
        aggregatedRequirements,
        allInventory
      );
      forecastResults = suggestions;
    } catch (err) {
      console.error('Error calculating forecast:', err);
      error = 'Failed to calculate forecast. Please try again.';
      forecastResults = [];
    } finally {
      loading = false;
      renderPage();
    }
  };

  const formatDate = (timestamp) => {
    return timestamp.toDate().toLocaleDateString();
  };

  fetchData(); // Initial data fetch and render
};

// LowStockPage (formerly src/pages/LowStockPage.js)
const LowStockPage = (container) => {
  let lowStockItems = [];
  let loading = true;
  let error = null;
  let filterText = '';

  const renderPage = () => {
    container.innerHTML = ''; // Clear previous content

    if (loading) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'flex flex-col items-center justify-center p-8 bg-white rounded-lg shadow-md';
      LoadingSpinner(loadingDiv);
      const p = document.createElement('p');
      p.className = 'mt-4 text-gray-700';
      p.textContent = 'Loading low stock items...';
      loadingDiv.appendChild(p);
      container.appendChild(loadingDiv);
      return;
    }

    if (error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'text-center p-4 bg-red-100 text-red-700 rounded-md';
      const p = document.createElement('p');
      p.textContent = `Error: ${error}`;
      errorDiv.appendChild(p);
      const retryButtonWrapper = document.createElement('div');
      Button(retryButtonWrapper, { onClick: fetchLowStockItems, className: 'mt-4', children: 'Retry' });
      errorDiv.appendChild(retryButtonWrapper);
      container.appendChild(errorDiv);
      return;
    }

    const pageDiv = document.createElement('div');
    pageDiv.className = 'p-4 md:p-8 bg-white rounded-lg shadow-md';
    container.appendChild(pageDiv);

    const h1 = document.createElement('h1');
    h1.className = 'text-4xl font-bold text-gray-900 mb-6 text-center';
    h1.textContent = 'Low Stock Alerts';
    pageDiv.appendChild(h1);

    const introP = document.createElement('p');
    introP.className = 'text-lg text-gray-700 mb-8 text-center';
    introP.textContent = 'These items are currently below their set minimum required quantity. Time to reorder!';
    pageDiv.appendChild(introP);

    const filterDiv = document.createElement('div');
    filterDiv.className = 'mb-6';
    Input(filterDiv, {
      id: 'filter-low-stock',
      label: 'Filter Items',
      type: 'text',
      value: filterText,
      onChange: (e) => {
        filterText = e.target.value;
        renderTable();
      },
      placeholder: 'Search by ingredient name',
      className: 'w-full'
    });
    pageDiv.appendChild(filterDiv);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'overflow-x-auto';
    pageDiv.appendChild(tableContainer);

    const renderTable = () => {
      tableContainer.innerHTML = ''; // Clear previous table content

      const filteredItems = lowStockItems.filter(item =>
        item.name.toLowerCase().includes(filterText.toLowerCase()) ||
        item.ingredient_name.toLowerCase().includes(filterText.toLowerCase()) ||
        item.ingredient_simplified_name.toLowerCase().includes(filterText.toLowerCase())
      );

      if (filteredItems.length > 0) {
        const table = document.createElement('table');
        table.className = 'min-w-full bg-white border border-gray-200 divide-y divide-gray-200';
        tableContainer.appendChild(table);

        const thead = document.createElement('thead');
        thead.className = 'bg-red-50';
        thead.innerHTML = `
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ingredient Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Quantity</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min. Required</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Counted</th>
          </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        tbody.className = 'bg-white divide-y divide-gray-200';
        table.appendChild(tbody);

        filteredItems.forEach(item => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-red-50';
          tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${item.package_description}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">${item.quantity}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${item.minimum_quantity_required}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${item.last_counted_date}</td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        const p = document.createElement('p');
        p.className = 'text-center text-gray-600 mt-8';
        p.textContent = 'All stock levels are currently above their minimum thresholds. Good job!';
        tableContainer.appendChild(p);
      }
    };
    renderTable(); // Initial table render
  };

  const fetchLowStockItems = async () => {
    loading = true;
    error = null;
    renderPage(); // Show loading state
    try {
      const allItems = await inventoryService.getInventoryItems();
      const filtered = allItems.filter(item => {
        const currentQuantity = parseFloat(item.quantity || '0');
        const minRequired = parseFloat(item.minimum_quantity_required || '0');
        return currentQuantity < minRequired && minRequired > 0;
      });
      lowStockItems = filtered;
    } catch (err) {
      console.error('Error fetching low stock items:', err);
      error = 'Failed to load low stock items.';
    } finally {
      loading = false;
      renderPage(); // Re-render with data or error
    }
  };

  fetchLowStockItems(); // Initial fetch
};

// LoginPage (formerly src/pages/LoginPage.js)
const LoginPage = (container) => {
  let email = '';
  let password = '';
  let loginError = null;
  let loading = authManager.getLoading(); // Get initial loading state from authManager

  const renderPage = () => {
    container.innerHTML = ''; // Clear previous content
    container.className = 'flex items-center justify-center min-h-screen bg-gray-100 p-4';

    if (loading) {
      LoadingSpinner(container);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'w-full max-w-md bg-white rounded-lg shadow-xl p-8';
    container.appendChild(wrapper);

    const h1 = document.createElement('h1');
    h1.className = 'text-3xl font-bold text-gray-900 mb-6 text-center';
    h1.textContent = 'Login to KitchenPro';
    wrapper.appendChild(h1);

    if (loginError) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4';
      errorDiv.setAttribute('role', 'alert');
      const span = document.createElement('span');
      span.className = 'block sm:inline';
      span.textContent = loginError;
      errorDiv.appendChild(span);
      wrapper.appendChild(errorDiv);
    }

    const form = document.createElement('form');
    form.addEventListener('submit', handleSubmit);
    wrapper.appendChild(form);

    Input(form, {
      id: 'email',
      label: 'Email',
      type: 'email',
      value: email,
      onChange: (e) => { email = e.target.value; },
      required: true,
      autoComplete: 'email',
    });

    Input(form, {
      id: 'password',
      label: 'Password',
      type: 'password',
      value: password,
      onChange: (e) => { password = e.target.value; },
      required: true,
      autoComplete: 'current-password',
    });

    const buttonWrapper = document.createElement('div'); // Wrapper for Button component
    Button(buttonWrapper, {
      type: 'submit',
      className: 'w-full mt-6',
      loading: loading,
      children: 'Log In'
    });
    form.appendChild(buttonWrapper);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    loginError = null;
    loading = true; // Set local loading state
    renderPage(); // Re-render to show loading spinner

    try {
      await authManager.login(email, password);
      // AuthManager's onAuthStateChanged will handle redirection
    } catch (error) {
      console.error('Login failed:', error);
      if (error.code === 'auth/invalid-email') {
        loginError = 'Invalid email address format.';
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        loginError = 'Invalid credentials. Please check your email and password.';
      } else if (error.code === 'auth/too-many-requests') {
        loginError = 'Too many failed login attempts. Please try again later.';
      } else {
        loginError = 'Failed to log in. Please try again.';
      }
    } finally {
      loading = false; // Reset local loading state
      renderPage(); // Re-render to show error or successful state
    }
  };

  // Listen to auth state changes for loading state, which also triggers re-render if needed
  authManager.onAuthChange((user) => {
    loading = authManager.getLoading();
    // Only re-render if current route is login or if auth state changes from unauthenticated to authenticated
    // and current route is login, in which case the router will handle redirect.
    if (window.location.hash === '#/login' || (user && window.location.hash === '#/login')) {
      renderPage();
    }
  });

  renderPage(); // Initial render
};

// MenuManagementPage (formerly src/pages/MenuManagementPage.js)
const MenuManagementPage = (container) => {
  let allDishes = [];
  let weeklyMenus = [];
  let loading = true;
  let error = null;

  let selectedWeeklyMenu = null;
  let newMenuName = '';
  let newMenuStartDate = '';
  let newMenuEndDate = '';
  let selectedDishesForNewMenu = [];
  let filterText = '';

  const renderPage = () => {
    container.innerHTML = ''; // Clear previous content

    if (loading && allDishes.length === 0 && weeklyMenus.length === 0) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'flex flex-col items-center justify-center p-8 bg-white rounded-lg shadow-md';
      LoadingSpinner(loadingDiv);
      const p = document.createElement('p');
      p.className = 'mt-4 text-gray-700';
      p.textContent = 'Loading menu data...';
      loadingDiv.appendChild(p);
      container.appendChild(loadingDiv);
      return;
    }

    const pageDiv = document.createElement('div');
    pageDiv.className = 'p-4 md:p-8 bg-white rounded-lg shadow-md';
    container.appendChild(pageDiv);

    const h1 = document.createElement('h1');
    h1.className = 'text-4xl font-bold text-gray-900 mb-6 text-center';
    h1.textContent = 'Weekly Menu Management';
    pageDiv.appendChild(h1);

    const introP = document.createElement('p');
    introP.className = 'text-lg text-gray-700 mb-8 text-center max-w-2xl mx-auto';
    introP.textContent = 'Plan your weekly culinary offerings by selecting dishes and defining menu periods.';
    pageDiv.appendChild(introP);

    if (error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6';
      errorDiv.setAttribute('role', 'alert');
      const span = document.createElement('span');
      span.className = 'block sm:inline';
      span.textContent = error;
      errorDiv.appendChild(span);
      pageDiv.appendChild(errorDiv);
    }

    // Select Existing Menu / Create New Menu section
    const menuSelectionSection = document.createElement('div');
    menuSelectionSection.className = 'mb-8 p-6 bg-blue-50 rounded-lg shadow-inner';
    pageDiv.appendChild(menuSelectionSection);

    const h2SelectMenu = document.createElement('h2');
    h2SelectMenu.className = 'text-2xl font-semibold text-blue-800 mb-4';
    h2SelectMenu.textContent = 'Select or Create Menu';
    menuSelectionSection.appendChild(h2SelectMenu);

    const selectMenuDiv = document.createElement('div');
    selectMenuDiv.className = 'mb-4';
    menuSelectionSection.appendChild(selectMenuDiv);

    const labelSelectMenu = document.createElement('label');
    labelSelectMenu.htmlFor = 'select-menu';
    labelSelectMenu.className = 'block text-sm font-medium text-gray-700 mb-1';
    labelSelectMenu.textContent = 'Existing Menus:';
    selectMenuDiv.appendChild(labelSelectMenu);

    const selectMenu = document.createElement('select');
    selectMenu.id = 'select-menu';
    selectMenu.value = selectedWeeklyMenu?.id || '';
    selectMenu.addEventListener('change', (e) => handleSelectExistingMenu(e.target.value));
    selectMenu.className = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm';
    selectMenuDiv.appendChild(selectMenu);

    const newMenuOption = document.createElement('option');
    newMenuOption.value = '';
    newMenuOption.textContent = '-- Create New Menu --';
    selectMenu.appendChild(newMenuOption);

    weeklyMenus
      .sort((a, b) => b.startDate.toDate().getTime() - a.startDate.toDate().getTime())
      .forEach(menu => {
        const option = document.createElement('option');
        option.value = menu.id;
        option.textContent = `${menu.name} (${formatDate(menu.startDate)} - ${formatDate(menu.endDate)})`;
        selectMenu.appendChild(option);
      });

    // New/Edit Menu Form
    const menuFormGrid = document.createElement('div');
    menuFormGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 mb-4';
    menuSelectionSection.appendChild(menuFormGrid);

    const createInputGroup = (labelText, inputId, value, onChangeHandler, placeholder = '', type = 'text') => {
      const div = document.createElement('div');
      const label = document.createElement('label');
      label.htmlFor = inputId;
      label.className = 'block text-sm font-medium text-gray-700 mb-1';
      label.textContent = labelText;
      div.appendChild(label);

      const input = document.createElement('input');
      input.type = type;
      input.id = inputId;
      input.value = value;
      input.addEventListener('input', onChangeHandler);
      input.placeholder = placeholder;
      input.className = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm';
      div.appendChild(input);
      menuFormGrid.appendChild(div);
    };

    createInputGroup('Menu Name:', 'menu-name', newMenuName, (e) => newMenuName = e.target.value, 'e.g., Nov 2025 Berlin Weekly');
    createInputGroup('Start Date:', 'start-date', newMenuStartDate, (e) => newMenuStartDate = e.target.value, '', 'date');
    createInputGroup('End Date:', 'end-date', newMenuEndDate, (e) => newMenuEndDate = e.target.value, '', 'date');

    const saveButtonWrapper = document.createElement('div');
    Button(saveButtonWrapper, {
      onClick: handleCreateOrUpdateMenu,
      disabled: loading,
      className: 'w-full',
      children: selectedWeeklyMenu ? 'Update Weekly Menu' : 'Create Weekly Menu'
    });
    menuSelectionSection.appendChild(saveButtonWrapper);

    // Dish Selection
    const h2Dishes = document.createElement('h2');
    h2Dishes.className = 'text-2xl font-semibold text-gray-800 mb-4';
    h2Dishes.textContent = 'Available Dishes';
    pageDiv.appendChild(h2Dishes);

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.placeholder = 'Filter dishes...';
    filterInput.value = filterText;
    filterInput.addEventListener('input', (e) => {
      filterText = e.target.value;
      renderDishSelection();
    });
    filterInput.className = 'block w-full px-3 py-2 mb-6 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm';
    pageDiv.appendChild(filterInput);

    const dishGridContainer = document.createElement('div');
    dishGridContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    pageDiv.appendChild(dishGridContainer);

    const renderDishSelection = () => {
      dishGridContainer.innerHTML = ''; // Clear existing dishes

      const filteredDishes = allDishes.filter(dish =>
        dish.variantName.toLowerCase().includes(filterText.toLowerCase()) ||
        dish.category.name.toLowerCase().includes(filterText.toLowerCase()) ||
        dish.diet.toLowerCase().includes(filterText.toLowerCase())
      );

      if (filteredDishes.length > 0) {
        filteredDishes.forEach(dish => {
          const dishCardWrapper = document.createElement('div');
          dishCardWrapper.className = `border rounded-lg overflow-hidden transition-all duration-200 ${
            selectedDishesForNewMenu.includes(dish.id)
              ? 'border-blue-500 shadow-lg bg-blue-50'
              : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
          }`;
          dishCardWrapper.addEventListener('click', () => handleDishSelectionToggle(dish.id));

          const innerCard = document.createElement('div');
          innerCard.className = 'cursor-pointer p-4 flex flex-col h-full';
          dishCardWrapper.appendChild(innerCard);

          const dishHeader = document.createElement('div');
          dishHeader.className = 'flex items-start mb-3';
          innerCard.appendChild(dishHeader);

          const img = document.createElement('img');
          img.src = dish.webUrl || `https://picsum.photos/100/100?random=${dish.id}`;
          img.alt = dish.variantName;
          img.className = 'w-20 h-20 object-cover rounded-md mr-4 flex-shrink-0';
          dishHeader.appendChild(img);

          const textContent = document.createElement('div');
          textContent.className = 'flex-grow';
          dishHeader.appendChild(textContent);

          const h3 = document.createElement('h3');
          h3.className = 'text-lg font-semibold text-gray-800';
          h3.textContent = dish.variantName;
          textContent.appendChild(h3);

          const pCategory = document.createElement('p');
          pCategory.className = 'text-sm text-gray-600';
          pCategory.innerHTML = `${dish.category.name} <span class="font-medium ${dish.diet === 'vegan' ? 'text-green-600' : dish.diet === 'vegetarian' ? 'text-yellow-600' : 'text-red-600'}">(${dish.diet})</span>`;
          textContent.appendChild(pCategory);

          const pType = document.createElement('p');
          pType.className = 'text-xs text-gray-500';
          pType.textContent = `Type: ${dish.type}`;
          textContent.appendChild(pType);

          const footer = document.createElement('div');
          footer.className = 'flex justify-end mt-auto pt-2';
          innerCard.appendChild(footer);

          const statusSpan = document.createElement('span');
          statusSpan.className = `px-3 py-1 text-sm font-medium rounded-full ${
            selectedDishesForNewMenu.includes(dish.id)
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700'
          }`;
          statusSpan.textContent = selectedDishesForNewMenu.includes(dish.id) ? 'Selected' : 'Select';
          footer.appendChild(statusSpan);

          dishGridContainer.appendChild(dishCardWrapper);
        });
      } else {
        const p = document.createElement('p');
        p.className = 'text-center text-gray-600 col-span-full';
        p.textContent = 'No dishes available. Please import dishes from settings.';
        dishGridContainer.appendChild(p);
      }
    };
    renderDishSelection(); // Initial dish selection render

    // Selected Menu Details (Optional - to display the currently selected menu's dishes)
    if (selectedWeeklyMenu) {
      const detailsSection = document.createElement('div');
      detailsSection.className = 'mt-10 p-6 bg-gray-50 rounded-lg shadow-inner';
      pageDiv.appendChild(detailsSection);

      const h2Details = document.createElement('h2');
      h2Details.className = 'text-2xl font-semibold text-gray-800 mb-4';
      h2Details.textContent = `Details for: ${selectedWeeklyMenu.name}`;
      detailsSection.appendChild(h2Details);

      const pPeriod = document.createElement('p');
      pPeriod.className = 'mb-4 text-gray-700';
      pPeriod.textContent = `Period: ${formatDate(selectedWeeklyMenu.startDate)} - ${formatDate(selectedWeeklyMenu.endDate)}`;
      detailsSection.appendChild(pPeriod);

      if (selectedWeeklyMenu.dishIds.length > 0) {
        const selectedDishesGrid = document.createElement('div');
        selectedDishesGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        detailsSection.appendChild(selectedDishesGrid);

        allDishes
          .filter((d) => selectedWeeklyMenu.dishIds.includes(d.id))
          .forEach((dish) => {
            const dishCardWrapper = document.createElement('div');
            DishCard(dishCardWrapper, { dish: dish, showDetailsInitially: false });
            selectedDishesGrid.appendChild(dishCardWrapper);
          });
      } else {
        const pNoDishes = document.createElement('p');
        pNoDishes.className = 'text-gray-600';
        pNoDishes.textContent = 'No dishes selected for this menu.';
        detailsSection.appendChild(pNoDishes);
      }
    }
  };

  const fetchData = async () => {
    loading = true;
    error = null;
    renderPage();
    try {
      const dishes = await dishService.getDishes();
      const menus = await weeklyMenuService.getWeeklyMenus();
      allDishes = dishes;
      weeklyMenus = menus;

      if (menus.length > 0) {
        const sortedMenus = [...menus].sort((a, b) => b.startDate.toDate().getTime() - a.startDate.toDate().getTime());
        selectedWeeklyMenu = sortedMenus[0];
        newMenuName = sortedMenus[0].name;
        newMenuStartDate = sortedMenus[0].startDate.toDate().toISOString().split('T')[0];
        newMenuEndDate = sortedMenus[0].endDate.toDate().toISOString().split('T')[0];
        selectedDishesForNewMenu = sortedMenus[0].dishIds;
      } else {
        selectedWeeklyMenu = null;
        newMenuName = '';
        newMenuStartDate = '';
        newMenuEndDate = '';
        selectedDishesForNewMenu = [];
      }
    } catch (err) {
      console.error('Error fetching data for menu management:', err);
      error = 'Failed to load dishes or menus.';
    } finally {
      loading = false;
      renderPage();
    }
  };

  const handleCreateOrUpdateMenu = async () => {
    loading = true;
    error = null;
    renderPage(); // Show loading state
    try {
      if (!newMenuName || !newMenuStartDate || !newMenuEndDate) {
        throw new Error('Please fill in all new menu fields.');
      }

      const menuData = {
        name: newMenuName,
        startDate: Timestamp.fromDate(new Date(newMenuStartDate)),
        endDate: Timestamp.fromDate(new Date(newMenuEndDate)),
        dishIds: selectedDishesForNewMenu,
        kitchenId: 'Berlin-Kitchen-1', // Placeholder, ideally this would come from user settings
      };

      if (selectedWeeklyMenu && selectedWeeklyMenu.id) {
        await weeklyMenuService.updateWeeklyMenu(selectedWeeklyMenu.id, menuData);
        alert('Weekly menu updated successfully!');
      } else {
        await weeklyMenuService.addWeeklyMenu(menuData);
        alert('Weekly menu created successfully!');
      }

      // Clear form and re-fetch data
      newMenuName = '';
      newMenuStartDate = '';
      newMenuEndDate = '';
      selectedDishesForNewMenu = [];
      await fetchData();
    } catch (err) {
      console.error('Error saving weekly menu:', err);
      error = err.message || 'Failed to save weekly menu.';
    } finally {
      loading = false;
      renderPage(); // Re-render with updated data or error
    }
  };

  const handleDishSelectionToggle = (dishId) => {
    if (selectedDishesForNewMenu.includes(dishId)) {
      selectedDishesForNewMenu = selectedDishesForNewMenu.filter((id) => id !== dishId);
    } else {
      selectedDishesForNewMenu = [...selectedDishesForNewMenu, dishId];
    }
    renderDishSelection(); // Re-render only dish selection section
  };

  const handleSelectExistingMenu = (menuId) => {
    const menu = weeklyMenus.find((m) => m.id === menuId);
    if (menu) {
      selectedWeeklyMenu = menu;
      newMenuName = menu.name;
      newMenuStartDate = menu.startDate.toDate().toISOString().split('T')[0];
      newMenuEndDate = menu.endDate.toDate().toISOString().split('T')[0];
      selectedDishesForNewMenu = menu.dishIds;
    } else {
      selectedWeeklyMenu = null;
      newMenuName = '';
      newMenuStartDate = '';
      newMenuEndDate = '';
      selectedDishesForNewMenu = [];
    }
    renderPage(); // Re-render entire page to reflect menu change
  };

  const formatDate = (timestamp) => {
    return timestamp.toDate().toLocaleDateString();
  };

  fetchData(); // Initial data fetch and render
};

// OrderEntryPage (formerly src/pages/OrderEntryPage.js)
const OrderEntryPage = (container) => {
  let loading = true;
  let error = null;
  let selectedDate = new Date().toISOString().split('T')[0];
  let weeklyMenus = [];
  let allDishes = [];
  let selectedWeeklyMenu = null;
  let dailyDishOrders = [];
  let existingDailyOrder = null;
  let successMessage = null;

  const renderPage = () => {
    container.innerHTML = ''; // Clear previous content

    if (loading && weeklyMenus.length === 0 && allDishes.length === 0) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'flex flex-col items-center justify-center p-8 bg-white rounded-lg shadow-md';
      LoadingSpinner(loadingDiv);
      const p = document.createElement('p');
      p.className = 'mt-4 text-gray-700';
      p.textContent = 'Loading menu and dish data...';
      loadingDiv.appendChild(p);
      container.appendChild(loadingDiv);
      return;
    }

    const pageDiv = document.createElement('div');
    pageDiv.className = 'p-4 md:p-8 bg-white rounded-lg shadow-md';
    container.appendChild(pageDiv);

    const h1 = document.createElement('h1');
    h1.className = 'text-4xl font-bold text-gray-900 mb-6 text-center';
    h1.textContent = 'Daily Order Entry';
    pageDiv.appendChild(h1);

    const introP = document.createElement('p');
    introP.className = 'text-lg text-gray-700 mb-8 text-center max-w-2xl mx-auto';
    introP.textContent = 'Input the quantities of each dish cooked for the day. This will help track consumption and inform future forecasts.';
    pageDiv.appendChild(introP);

    if (error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6';
      errorDiv.setAttribute('role', 'alert');
      const span = document.createElement('span');
      span.className = 'block sm:inline';
      span.textContent = error;
      errorDiv.appendChild(span);
      pageDiv.appendChild(errorDiv);
    }
    if (successMessage) {
      const successDiv = document.createElement('div');
      successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-6';
      successDiv.setAttribute('role', 'alert');
      const span = document.createElement('span');
      span.className = 'block sm:inline';
      span.textContent = successMessage;
      successDiv.appendChild(span);
      pageDiv.appendChild(successDiv);
    }

    const dateSelectionSection = document.createElement('div');
    dateSelectionSection.className = 'mb-6 p-6 bg-blue-50 rounded-lg shadow-inner';
    pageDiv.appendChild(dateSelectionSection);

    const labelDate = document.createElement('label');
    labelDate.htmlFor = 'order-date';
    labelDate.className = 'block text-sm font-medium text-gray-700 mb-1';
    labelDate.textContent = 'Select Date:';
    dateSelectionSection.appendChild(labelDate);

    Input(dateSelectionSection, {
      id: 'order-date',
      type: 'date',
      value: selectedDate,
      onChange: (e) => {
        selectedDate = e.target.value;
        loadMenuAndOrdersForDate();
      },
      className: 'w-full md:w-auto'
    });

    const menuInfoP = document.createElement('p');
    menuInfoP.className = 'mt-4 text-md text-gray-700';
    dateSelectionSection.appendChild(menuInfoP);

    if (selectedWeeklyMenu) {
      menuInfoP.innerHTML = `Menu for this date: <span class="font-semibold">${selectedWeeklyMenu.name}</span> (${selectedWeeklyMenu.startDate.toDate().toLocaleDateString()} - ${selectedWeeklyMenu.endDate.toDate().toLocaleDateString()})`;
    } else {
      menuInfoP.className = 'mt-4 text-md text-red-600';
      menuInfoP.textContent = 'No weekly menu found for this date. Please set up a menu in "Menu Management" first.';
    }

    if (selectedWeeklyMenu && menuDishes().length > 0) {
      const dishesSection = document.createElement('div');
      dishesSection.className = 'mb-8';
      pageDiv.appendChild(dishesSection);

      const h2Dishes = document.createElement('h2');
      h2Dishes.className = 'text-2xl font-semibold text-gray-800 mb-4';
      h2Dishes.textContent = 'Dishes for Today';
      dishesSection.appendChild(h2Dishes);

      const dishGrid = document.createElement('div');
      dishGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
      dishesSection.appendChild(dishGrid);

      menuDishes().forEach((dish) => {
        const currentOrder = dailyDishOrders.find((order) => order.dishId === dish.id);
        const dishCardWrapper = document.createElement('div');
        DishCard(dishCardWrapper, {
          dish: dish,
          onQuantityChange: handleDishQuantityChange,
          currentOrderQuantity: currentOrder?.orderedQuantity || 0
        });
        dishGrid.appendChild(dishCardWrapper);
      });

      const saveButtonWrapper = document.createElement('div');
      Button(saveButtonWrapper, {
        onClick: handleSaveDailyOrders,
        disabled: loading || !selectedWeeklyMenu,
        className: 'w-full mt-8',
        children: loading ? 'Saving...' : 'Save Daily Orders'
      });
      dishesSection.appendChild(saveButtonWrapper);
    } else if (selectedWeeklyMenu) {
      const pNoDishes = document.createElement('p');
      pNoDishes.className = 'text-center text-gray-600 mt-8';
      pNoDishes.textContent = 'No dishes are associated with the menu for this date.';
      pageDiv.appendChild(pNoDishes);
    } else {
      const pSelectDate = document.createElement('p');
      pSelectDate.className = 'text-center text-gray-600 mt-8';
      pSelectDate.textContent = 'Select a date to view and enter orders.';
      pageDiv.appendChild(pSelectDate);
    }
  };

  const fetchData = async () => {
    loading = true;
    error = null;
    successMessage = null;
    renderPage();
    try {
      weeklyMenus = await weeklyMenuService.getWeeklyMenus();
      allDishes = await dishService.getDishes();
    } catch (err) {
      console.error('Error fetching initial data:', err);
      error = 'Failed to load initial data.';
    } finally {
      loading = false;
      await loadMenuAndOrdersForDate(); // Load menu and orders after initial data
      renderPage();
    }
  };

  const loadMenuAndOrdersForDate = async () => {
    if (!selectedDate) {
      selectedWeeklyMenu = null;
      dailyDishOrders = [];
      existingDailyOrder = null;
      renderPage();
      return;
    }

    loading = true;
    error = null;
    successMessage = null;
    renderPage(); // Show loading state

    try {
      const dateObj = new Date(selectedDate);
      const menu = await weeklyMenuService.getWeeklyMenuForDate(dateObj);
      selectedWeeklyMenu = menu;

      if (menu) {
        const existingOrder = await dailyOrderService.getDailyOrderForDateAndMenu(
          dateObj,
          menu.id
        );
        existingDailyOrder = existingOrder;

        if (existingOrder) {
          dailyDishOrders = existingOrder.dishOrders;
        } else {
          dailyDishOrders = menu.dishIds.map((dishId) => ({ dishId, orderedQuantity: 0 }));
        }
      } else {
        dailyDishOrders = [];
        existingDailyOrder = null;
      }
    } catch (err) {
      console.error('Error loading menu or orders for date:', err);
      error = 'Failed to load menu or daily orders for the selected date.';
    } finally {
      loading = false;
      renderPage(); // Re-render with data or error
    }
  };

  const handleDishQuantityChange = (dishId, quantity) => {
    dailyDishOrders = dailyDishOrders.map((order) =>
      order.dishId === dishId ? { ...order, orderedQuantity: quantity } : order
    );
    renderPage(); // Re-render to reflect quantity change
  };

  const handleSaveDailyOrders = async () => {
    loading = true;
    error = null;
    successMessage = null;
    renderPage(); // Show loading state
    try {
      if (!selectedWeeklyMenu || !selectedWeeklyMenu.id) {
        throw new Error('No weekly menu selected for this date.');
      }

      const ordersToSave = {
        date: Timestamp.fromDate(new Date(selectedDate)),
        menuId: selectedWeeklyMenu.id,
        dishOrders: dailyDishOrders.filter((order) => order.orderedQuantity > 0),
      };

      if (existingDailyOrder) {
        await dailyOrderService.updateDailyOrder(existingDailyOrder.id, ordersToSave);
        successMessage = 'Daily orders updated successfully!';
      } else {
        const newOrderId = await dailyOrderService.addDailyOrder(ordersToSave);
        existingDailyOrder = { ...ordersToSave, id: newOrderId, createdAt: Timestamp.now() };
        successMessage = 'Daily orders saved successfully!';
      }

      // Deduct ingredients from inventory based on recorded orders
      const dishesInOrder = allDishes.filter(d => ordersToSave.dishOrders.some(odo => odo.dishId === d.id));
      const currentInventory = await inventoryService.getInventoryItems();
      const inventoryMap = new Map(currentInventory.map(item => [item.ingredient_id, item])); // Use ingredient_id for mapping

      for (const dishOrder of ordersToSave.dishOrders) {
        const dish = dishesInOrder.find(d => d.id === dishOrder.dishId);
        if (dish && dishOrder.orderedQuantity > 0) {
          const flattenedIngredients = await dishService.getFlattenedIngredientsForDish(dish.id);
          for (const [ingredientId, ingredient] of flattenedIngredients.entries()) {
            const consumedAmount = ingredient.amount * dishOrder.orderedQuantity;
            const invItem = inventoryMap.get(Number(ingredientId)); // Match by ingredient_id
            if (invItem) {
                const currentStock = parseFloat(invItem.quantity || '0');
                const newStock = Math.max(0, currentStock - consumedAmount);
                await inventoryService.updateInventoryItemQuantity(invItem.id, newStock); // Update using invItem.id
            } else {
                console.warn(`Ingredient with ID ${ingredientId} for dish ${dish.variantName} not found in inventory.`);
            }
          }
        }
      }

    } catch (err) {
      console.error('Error saving daily orders:', err);
      error = err.message || 'Failed to save daily orders.';
    } finally {
      loading = false;
      renderPage(); // Re-render with success/error message and updated data
    }
  };

  const menuDishes = () => selectedWeeklyMenu
    ? allDishes.filter((dish) => selectedWeeklyMenu.dishIds.includes(dish.id))
    : [];

  fetchData(); // Initial data fetch and render
};

// SettingsPage (formerly src/pages/SettingsPage.js)
const SettingsPage = (container) => {
  let inventoryJson = '';
  let dishJson = '';
  let message = null;
  let error = null;
  let loading = false;
  let inventoryItems = [];
  let editingItemId = null;
  let editingThreshold = '';
  let filterText = '';

  const renderPage = () => {
    container.innerHTML = ''; // Clear previous content

    const pageDiv = document.createElement('div');
    pageDiv.className = 'p-4 md:p-8 bg-white rounded-lg shadow-md';
    container.appendChild(pageDiv);

    const h1 = document.createElement('h1');
    h1.className = 'text-4xl font-bold text-gray-900 mb-6 text-center';
    h1.textContent = 'Settings';
    pageDiv.appendChild(h1);

    const introP = document.createElement('p');
    introP.className = 'text-lg text-gray-700 mb-8 text-center max-w-2xl mx-auto';
    introP.textContent = 'Manage your inventory and menu data by importing JSON files and setting up ingredient thresholds.';
    pageDiv.appendChild(introP);

    if (loading) {
      LoadingSpinner(pageDiv);
    }
    if (error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6';
      errorDiv.setAttribute('role', 'alert');
      const span = document.createElement('span');
      span.className = 'block sm:inline';
      span.textContent = error;
      errorDiv.appendChild(span);
      pageDiv.appendChild(errorDiv);
    }
    if (message) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-6';
      messageDiv.setAttribute('role', 'alert');
      const span = document.createElement('span');
      span.className = 'block sm:inline';
      span.textContent = message;
      messageDiv.appendChild(span);
      pageDiv.appendChild(messageDiv);
    }

    // JSON Import Section
    const importSection = document.createElement('div');
    importSection.className = 'mb-8 p-6 bg-blue-50 rounded-lg shadow-inner';
    pageDiv.appendChild(importSection);

    const h2Import = document.createElement('h2');
    h2Import.className = 'text-2xl font-semibold text-blue-800 mb-4';
    h2Import.textContent = 'Data Import';
    importSection.appendChild(h2Import);

    const inventoryJsonDiv = document.createElement('div');
    inventoryJsonDiv.className = 'mb-6';
    importSection.appendChild(inventoryJsonDiv);

    const labelInventoryJson = document.createElement('label');
    labelInventoryJson.htmlFor = 'inventory-json';
    labelInventoryJson.className = 'block text-sm font-medium text-gray-700 mb-1';
    labelInventoryJson.textContent = 'Import Inventory Data (JSON):';
    inventoryJsonDiv.appendChild(labelInventoryJson);

    const textareaInventory = document.createElement('textarea');
    textareaInventory.id = 'inventory-json';
    textareaInventory.rows = 8;
    textareaInventory.className = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm';
    textareaInventory.value = inventoryJson;
    textareaInventory.addEventListener('input', (e) => { inventoryJson = e.target.value; renderPage(); }); // Re-render to update button disabled state
    textareaInventory.placeholder = 'Paste your inventory JSON here...';
    inventoryJsonDiv.appendChild(textareaInventory);

    const inventoryButtonWrapper = document.createElement('div');
    Button(inventoryButtonWrapper, {
      onClick: handleInventoryJsonUpload,
      disabled: loading || !inventoryJson,
      className: 'mt-4 w-full',
      children: 'Upload Inventory'
    });
    inventoryJsonDiv.appendChild(inventoryButtonWrapper);

    const dishJsonDiv = document.createElement('div');
    importSection.appendChild(dishJsonDiv);

    const labelDishJson = document.createElement('label');
    labelDishJson.htmlFor = 'dish-json';
    labelDishJson.className = 'block text-sm font-medium text-gray-700 mb-1';
    labelDishJson.textContent = 'Import Dish Data (JSON):';
    dishJsonDiv.appendChild(labelDishJson);

    const textareaDish = document.createElement('textarea');
    textareaDish.id = 'dish-json';
    textareaDish.rows = 8;
    textareaDish.className = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm';
    textareaDish.value = dishJson;
    textareaDish.addEventListener('input', (e) => { dishJson = e.target.value; renderPage(); }); // Re-render to update button disabled state
    textareaDish.placeholder = 'Paste your dish JSON here...';
    dishJsonDiv.appendChild(textareaDish);

    const dishButtonWrapper = document.createElement('div');
    Button(dishButtonWrapper, {
      onClick: handleDishJsonUpload,
      disabled: loading || !dishJson,
      className: 'mt-4 w-full',
      children: 'Upload Dishes'
    });
    dishJsonDiv.appendChild(dishButtonWrapper);

    // Threshold Management Section
    const thresholdSection = document.createElement('div');
    thresholdSection.className = 'p-6 bg-white rounded-lg shadow-lg';
    pageDiv.appendChild(thresholdSection);

    const h2Threshold = document.createElement('h2');
    h2Threshold.className = 'text-2xl font-semibold text-gray-800 mb-4';
    h2Threshold.textContent = 'Inventory Threshold Management';
    thresholdSection.appendChild(h2Threshold);

    const pThreshold = document.createElement('p');
    pThreshold.className = 'text-md text-gray-600 mb-6';
    pThreshold.textContent = 'Set the minimum quantity required for each inventory item. Items falling below this level will appear on the "Low Stock" page.';
    thresholdSection.appendChild(pThreshold);

    const filterInputWrapper = document.createElement('div');
    Input(filterInputWrapper, {
      id: 'filter-inventory',
      label: 'Filter Inventory',
      type: 'text',
      value: filterText,
      onChange: (e) => { filterText = e.target.value; renderTable(); },
      placeholder: 'Search by ingredient name',
      className: 'mb-4'
    });
    thresholdSection.appendChild(filterInputWrapper);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'overflow-x-auto';
    thresholdSection.appendChild(tableContainer);

    const renderTable = () => {
      tableContainer.innerHTML = ''; // Clear previous table content

      const filteredItems = inventoryItems.filter(item =>
        item.name.toLowerCase().includes(filterText.toLowerCase()) ||
        item.ingredient_name.toLowerCase().includes(filterText.toLowerCase()) ||
        item.ingredient_simplified_name.toLowerCase().includes(filterText.toLowerCase())
      );

      if (filteredItems.length > 0) {
        const table = document.createElement('table');
        table.className = 'min-w-full bg-white border border-gray-200 divide-y divide-gray-200';
        tableContainer.appendChild(table);

        const thead = document.createElement('thead');
        thead.className = 'bg-gray-50';
        thead.innerHTML = `
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stock</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min. Required (Threshold)</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        tbody.className = 'bg-white divide-y divide-gray-200';
        table.appendChild(tbody);

        filteredItems.forEach(item => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-gray-50';

          const tdName = document.createElement('td');
          tdName.className = 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900';
          tdName.textContent = item.name;
          tr.appendChild(tdName);

          const tdPackage = document.createElement('td');
          tdPackage.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-600';
          tdPackage.textContent = item.package_description;
          tr.appendChild(tdPackage);

          const tdStock = document.createElement('td');
          tdStock.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-600';
          tdStock.textContent = item.quantity;
          tr.appendChild(tdStock);

          const tdThreshold = document.createElement('td');
          tdThreshold.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-600';
          tr.appendChild(tdThreshold);

          if (editingItemId === item.id) {
            const inputThreshold = document.createElement('input');
            inputThreshold.type = 'number';
            inputThreshold.min = '0';
            inputThreshold.value = editingThreshold;
            inputThreshold.addEventListener('input', (e) => { editingThreshold = e.target.value; });
            inputThreshold.className = 'w-24 px-2 py-1 border border-gray-300 rounded-md';
            tdThreshold.appendChild(inputThreshold);
          } else {
            tdThreshold.textContent = item.minimum_quantity_required;
          }

          const tdActions = document.createElement('td');
          tdActions.className = 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium';
          tr.appendChild(tdActions);

          if (editingItemId === item.id) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'flex space-x-2';

            const saveButtonWrapper = document.createElement('div');
            Button(saveButtonWrapper, {
              onClick: () => handleSaveThreshold(item.id),
              disabled: loading,
              size: 'small',
              children: 'Save'
            });
            actionsDiv.appendChild(saveButtonWrapper);

            const cancelButtonWrapper = document.createElement('div');
            Button(cancelButtonWrapper, {
              onClick: handleCancelEdit,
              variant: 'secondary',
              size: 'small',
              disabled: loading,
              children: 'Cancel'
            });
            actionsDiv.appendChild(cancelButtonWrapper);

            tdActions.appendChild(actionsDiv);
          } else {
            const editButtonWrapper = document.createElement('div');
            Button(editButtonWrapper, {
              onClick: () => handleEditThreshold(item),
              disabled: loading,
              size: 'small',
              variant: 'outline',
              children: 'Edit Threshold'
            });
            tdActions.appendChild(editButtonWrapper);
          }
          tbody.appendChild(tr);
        });
      } else {
        const p = document.createElement('p');
        p.className = 'text-center text-gray-600 mt-8';
        p.textContent = 'No inventory items found. Please upload inventory data above.';
        tableContainer.appendChild(p);
      }
    };
    renderTable(); // Initial table render
  };

  const fetchInventory = async () => {
    loading = true;
    error = null;
    renderPage(); // Show loading state
    try {
      inventoryItems = await inventoryService.getInventoryItems();
    } catch (err) {
      console.error('Error fetching inventory:', err);
      error = 'Failed to load inventory for threshold management.';
    } finally {
      loading = false;
      renderPage(); // Re-render with data or error
    }
  };

  const handleInventoryJsonUpload = async () => {
    loading = true;
    message = null;
    error = null;
    renderPage(); // Show loading state
    try {
      await inventoryService.importInventoryJson(inventoryJson);
      message = 'Inventory data imported successfully!';
      inventoryJson = '';
      await fetchInventory(); // Refresh inventory list and re-render
    } catch (err) {
      console.error('Error uploading inventory JSON:', err);
      error = err.message || 'Failed to upload inventory JSON.';
    } finally {
      loading = false;
      renderPage(); // Re-render with success/error message
    }
  };

  const handleDishJsonUpload = async () => {
    loading = true;
    message = null;
    error = null;
    renderPage(); // Show loading state
    try {
      await dishService.importDishJson(dishJson);
      message = 'Dish data imported successfully!';
      dishJson = '';
    } catch (err) {
      console.error('Error uploading dish JSON:', err);
      error = err.message || 'Failed to upload dish JSON.';
    } finally {
      loading = false;
      renderPage(); // Re-render with success/error message
    }
  };

  const handleEditThreshold = (item) => {
    editingItemId = item.id;
    editingThreshold = item.minimum_quantity_required;
    renderTable(); // Re-render table to show input field
  };

  const handleSaveThreshold = async (itemId) => {
    loading = true;
    error = null;
    renderPage(); // Show loading state
    try {
      const parsedThreshold = parseFloat(editingThreshold);
      if (isNaN(parsedThreshold) || parsedThreshold < 0) {
        throw new Error('Threshold must be a non-negative number.');
      }
      await inventoryService.updateInventoryItem(itemId, {
        minimum_quantity_required: String(parsedThreshold),
      });
      message = 'Threshold updated successfully!';
      editingItemId = null;
      editingThreshold = '';
      await fetchInventory(); // Refresh list to show updated value and re-render
    } catch (err) {
      console.error('Error saving threshold:', err);
      error = err.message || 'Failed to save threshold.';
    } finally {
      loading = false;
      renderPage(); // Re-render with success/error message
    }
  };

  const handleCancelEdit = () => {
    editingItemId = null;
    editingThreshold = '';
    error = null;
    renderTable(); // Re-render table to hide input field
  };

  fetchInventory(); // Initial fetch
};


// --- Main Application Logic (formerly Stock.js) ---

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const renderNavbar = (currentUser) => {
  const navbarContainer = document.querySelector('.nav-container'); // Use class for selection
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
  // Clear only the main content area, preserve navbar if present
  const existingMainContent = rootElement.querySelector('main');
  if (existingMainContent) {
    existingMainContent.remove();
  }

  const mainContent = document.createElement('main');
  mainContent.className = 'flex-grow container mx-auto p-4 md:p-6 lg:p-8';
  rootElement.appendChild(mainContent);

  const currentUser = authManager.getCurrentUser();
  const isLoading = authManager.getLoading();

  // If loading, show spinner regardless of route
  if (isLoading) {
    mainContent.innerHTML = ''; 
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
