// PART 1 of 3
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, getDocs, addDoc, writeBatch, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBAL VARIABLES ---
let app, auth, db, userId;
let isAuthReady = false;
let calendarDate = new Date();
let activeListeners = {};
let initialDataLoaded = false;
let currentSort = { column: null, direction: null };

// --- FIRESTORE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyDM0zahTuXrK5PJ9_uVIciVeXyKf6bui0U",
    authDomain: "buddy-c0f56.firebaseapp.com",
    projectId: "buddy-c0f56",
    storageBucket: "buddy-c0f56.appspot.com",
    messagingSenderId: "1002206808117",
    appId: "1:1002206808117:web:2e83aed7bce117afab897c"
};

// --- GLOBAL EXPORTS ---
window.showView = showView;
window.editIncome = editIncome;
window.deleteIncome = deleteIncome;
window.editExpense = editExpense;
window.deleteExpense = deleteExpense;
window.openItemizationModal = openItemizationModal;
window.deleteItemizedEntry = deleteItemizedEntry;
window.toggleSubscriptionStatus = toggleSubscriptionStatus;
window.editSubscription = editSubscription;
window.deleteSubscription = deleteSubscription;
window.editBudget = editBudget;
window.deleteBudget = deleteBudget;
window.editPaymentMethod = editPaymentMethod;
window.deletePaymentMethod = deletePaymentMethod;
window.deleteCategory = deleteCategory;
window.startEditCategory = startEditCategory;
window.deleteSubcategory = deleteSubcategory;
window.startEditSubcategory = startEditSubcategory;
window.editPerson = editPerson;
window.deletePerson = deletePerson;
window.editPoint = editPoint;
window.deletePoint = deletePoint;
window.editInvestment = editInvestment;
window.deleteInvestment = deleteInvestment;
window.deleteGroceryItem = deleteGroceryItem;
window.editGroceryShoppingList = editGroceryShoppingList;
window.deleteGroceryShoppingList = deleteGroceryShoppingList;

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        onAuthStateChanged(auth, async (user) => {
            console.log('DEBUG: onAuthStateChanged triggered.');
            if (user) {
                console.log('DEBUG: User object found. Proceeding with sign-in logic.');
                userId = user.uid;
                isAuthReady = true;

                try {
                    console.log('DEBUG: Starting processAutomaticExpenses...');
                    await processAutomaticExpenses();
                    console.log('DEBUG: Finished processAutomaticExpenses successfully.');
                } catch (error) {
                    console.error("DEBUG: ERROR in processAutomaticExpenses:", error);
                    showNotification("Could not process recurring bills.", true);
                }

                console.log('DEBUG: Updating UI to signed-in state...');
                document.getElementById('userIdDisplay').textContent = `User ID: ${userId}`;
                document.getElementById('userIdDisplay').classList.remove('hidden');
                document.getElementById('appContent').classList.remove('hidden');
                document.getElementById('authView').classList.add('hidden');
                
                await initApp();
                console.log('DEBUG: UI updated and initApp finished.');

            } else {
                console.log('DEBUG: No user object found. Proceeding with sign-out logic.');
                isAuthReady = false;
                userId = null;
                Object.values(activeListeners).forEach(unsub => unsub());
                activeListeners = {};
                document.getElementById('userIdDisplay').classList.add('hidden');
                document.getElementById('appContent').classList.add('hidden');
                document.getElementById('authView').classList.remove('hidden');
            }
        });

        // --- AUTHENTICATION LISTENERS ---
        document.getElementById('authForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('emailInput').value;
            const password = document.getElementById('passwordInput').value;
            const action = document.getElementById('authActionBtn').textContent;
            try {
                if (action.includes('Sign Up')) {
                    await createUserWithEmailAndPassword(auth, email, password);
                    showNotification('Account created successfully!');
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                    showNotification('Signed in successfully!');
                }
            } catch (error) {
                console.error("Auth error:", error);
                let message = 'An error occurred during authentication.';
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        message = 'The email address is already in use.';
                        break;
                    case 'auth/invalid-email':
                        message = 'The email address is invalid.';
                        break;
                    case 'auth/operation-not-allowed':
                        message = 'Email/password sign-in is not enabled.';
                        break;
                    case 'auth/weak-password':
                        message = 'The password is too weak.';
                        break;
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        message = 'Invalid email or password.';
                        break;
                }
                showNotification(message, true);
            }
        });

        document.getElementById('toggleAuthFormBtn').addEventListener('click', () => {
            const formTitle = document.getElementById('authFormTitle');
            const authActionBtn = document.getElementById('authActionBtn');
            if (authActionBtn.textContent.includes('Sign In')) {
                formTitle.textContent = 'Sign Up';
                authActionBtn.textContent = 'Sign Up';
                document.getElementById('toggleAuthFormBtn').textContent = 'Already have an account? Sign In';
            } else {
                formTitle.textContent = 'Sign In';
                authActionBtn.textContent = 'Sign In';
                document.getElementById('toggleAuthFormBtn').textContent = 'Create an account';
            }
        });
        
        document.getElementById('togglePasswordVisibility').addEventListener('click', () => {
            const passwordInput = document.getElementById('passwordInput');
            const passwordIcon = document.getElementById('passwordIcon');
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                passwordIcon.setAttribute('data-feather', 'eye-off');
            } else {
                passwordInput.type = 'password';
                passwordIcon.setAttribute('data-feather', 'eye');
            }
            feather.replace();
        });

        document.getElementById('signOutBtn').addEventListener('click', async () => {
            try {
                await signOut(auth);
                showNotification('Signed out successfully.');
            } catch (error) {
                console.error("Sign out error:", error);
                showNotification('Failed to sign out.', true);
            }
        });
        
    } catch (error) {
        console.error("Initialization failed:", error);
        showNotification("App failed to initialize. Check console.", true);
    }
});

async function initApp() {
    if (!isAuthReady) {
        console.log("Auth not ready, skipping app initialization.");
        return;
    }
    await reloadAllData();
    setupForms();
    setupTableSorting();
    setupCalendarNav();
    setupHamburgerMenu();
    setupItemizationModal();
    setupSalaryCalculator();
    
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    document.getElementById('reportMonth').value = `${year}-${month}`;
    document.getElementById('reportYear').value = year;
    await generateReports();
    await generateYearlyReports();
    
    showView('dashboardView', document.querySelector('[onclick*="dashboardView"]'));
    document.getElementById('currentDate').textContent = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// --- CORE FUNCTIONS ---

function showView(viewId, element) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
    document.getElementById('pageTitle').textContent = element ? element.textContent.trim() : 'Dashboard';

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active-nav');
    });
    if (element) element.classList.add('active-nav');

    document.getElementById('homeLink').classList.toggle('hidden', viewId === 'dashboardView');

    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth < 768) {
        sidebar.classList.add('-translate-x-full');
    }
}

function getCollection(path) {
    return collection(db, `users/${userId}/${path}`);
}

async function reloadAllData() {
    if (!isAuthReady) return;
    Object.values(activeListeners).forEach(unsub => unsub());
    activeListeners = {};
    
    initialDataLoaded = false;
    await loadData('income', loadIncome);
    await loadData('expenses', loadExpenses);
    await loadData('subscriptions', loadSubscriptions);
    await loadData('budgets', loadBudgets);
    await loadData('paymentMethods', loadPaymentMethods);
    await loadData('categories', loadCategories);
    await loadData('people', loadPeople);
    await loadData('creditCardPoints', loadPoints);
    await loadData('investments', loadInvestments);
    await loadData('groceryItems', loadGroceryItems);
    await loadData('groceryShoppingLists', loadGroceryShoppingLists);

    initialDataLoaded = true;
    
    setTimeout(() => feather.replace(), 100);
}

async function loadData(collectionName, renderFunction) {
    const q = query(getCollection(collectionName));
    activeListeners[collectionName] = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderFunction(data);
    }, (error) => {
        console.error(`Error listening to ${collectionName}:`, error);
        showNotification(`Failed to load ${collectionName} data.`, true);
    });
}
// --- NEW AUTOMATIC EXPENSE PROCESSING ---
async function processAutomaticExpenses() {
    if (!isAuthReady) return;
    console.log("DEBUG: processAutomaticExpenses: Starting function.");

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed (0 for Jan)
    const currentMonthStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}`;

    console.log("DEBUG: processAutomaticExpenses: Fetching data...");
    const budgetsSnapshot = await getDocs(query(getCollection('budgets')));
    const subscriptionsSnapshot = await getDocs(query(getCollection('subscriptions')));
    console.log("DEBUG: processAutomaticExpenses: Data fetched.");

    const budgets = budgetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const activeSubs = subscriptionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(s => s.status === 'active');
    
    const batch = writeBatch(db);
    let expensesToAdd = 0;

    // Process Budgets
    budgets.forEach(budget => {
        if (!budget.dueDay) return; // Skip if no due date

        const lastProcessedMonth = budget.lastAutoExpenseDate ? budget.lastAutoExpenseDate.substring(0, 7) : null;
        if (lastProcessedMonth === currentMonthStr) return; // Already processed this month

        if (today.getDate() >= budget.dueDay) {
            const expenseDate = new Date(currentYear, currentMonth, budget.dueDay).toISOString().slice(0, 10);
            
            const newExpenseRef = doc(getCollection('expenses'));
            batch.set(newExpenseRef, {
                payee: `${budget.category} Bill`,
                category: budget.category,
                subcategory: budget.subcategory,
                amount: budget.amount,
                date: expenseDate,
                paymentType: budget.paymentMethod || 'Unspecified',
                notes: 'Automatically generated expense.',
                items: []
            });

            const budgetRef = doc(getCollection('budgets'), budget.id);
            batch.update(budgetRef, { lastAutoExpenseDate: new Date().toISOString().slice(0, 10) });
            expensesToAdd++;
        }
    });

    // Process Subscriptions
    activeSubs.forEach(sub => {
        const startDate = new Date(sub.startDate + 'T00:00:00');
        const dueDay = startDate.getDate();

        const lastProcessedMonth = sub.lastAutoExpenseDate ? sub.lastAutoExpenseDate.substring(0, 7) : null;
        if (lastProcessedMonth === currentMonthStr) return;

        if (today.getDate() >= dueDay) {
            const expenseDate = new Date(currentYear, currentMonth, dueDay).toISOString().slice(0, 10);
            
            const newExpenseRef = doc(getCollection('expenses'));
            batch.set(newExpenseRef, {
                payee: sub.name,
                category: 'Subscriptions',
                subcategory: sub.name,
                amount: sub.amount,
                date: expenseDate,
                paymentType: sub.paymentMethod || 'Unspecified',
                notes: 'Automatically generated expense.',
                items: []
            });

            const subRef = doc(getCollection('subscriptions'), sub.id);
            batch.update(subRef, { lastAutoExpenseDate: new Date().toISOString().slice(0, 10) });
            expensesToAdd++;
        }
    });

    if (expensesToAdd > 0) {
        console.log(`DEBUG: processAutomaticExpenses: Found ${expensesToAdd} expenses to add. Committing batch...`);
        await batch.commit();
        console.log("DEBUG: processAutomaticExpenses: Batch committed.");
        showNotification(`${expensesToAdd} recurring expense(s) were automatically logged.`);
    } else {
        console.log("DEBUG: processAutomaticExpenses: No new automatic expenses to log.");
    }
}


// --- DATA RENDERERS ---
async function loadIncome(incomes) {
    const list = document.getElementById('incomeList');
    const summaryEl = document.getElementById('incomeSummary');
    list.innerHTML = '';
    let recurringTotal = 0;
    let oneTimeTotal = 0;
    const sourceTotals = {};
    incomes.forEach(income => {
        if (income.type === 'recurring') {
            recurringTotal += income.amount;
        } else {
            oneTimeTotal += income.amount;
        }
        sourceTotals[income.source] = (sourceTotals[income.source] || 0) + income.amount;
        const row = list.insertRow();
        row.innerHTML = `
            <td class="border px-4 py-2">${income.name}</td>
            <td class="border px-4 py-2">${income.source}</td>
            <td class="border px-4 py-2">${income.type}</td>
            <td class="border px-4 py-2 text-right">${formatCurrency(income.amount)}</td>
            <td class="border px-4 py-2">${income.date || 'N/A'}</td>
            <td class="border px-4 py-2 text-center">
                <button onclick="editIncome('${income.id}')" class="text-blue-500 hover:underline">Edit</button>
                <button onclick="deleteIncome('${income.id}')" class="text-red-500 hover:underline ml-2">Delete</button>
            </td>
        `;
    });
    summaryEl.innerHTML = `
        <div><p class="font-semibold">Recurring Total:</p> <p class="text-lg">${formatCurrency(recurringTotal)}</p></div>
        <div><p class="font-semibold">One-Time Total:</p> <p class="text-lg">${formatCurrency(oneTimeTotal)}</p></div>
    `;
    for(const source in sourceTotals) {
        summaryEl.innerHTML += `<div><p class="font-semibold">${source}:</p> <p class="text-lg">${formatCurrency(sourceTotals[source])}</p></div>`;
    }
    await updateBudgetSummary();
    await updateDashboard();
}

async function loadExpenses(expenses) {
    const list = document.getElementById('expenseList');
    list.innerHTML = '';
    expenses.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(expense => {
        const row = list.insertRow();
        const hasItems = expense.items && expense.items.length > 0;
        const itemizeButtonText = hasItems ? 'View Items' : 'Itemize';
        const itemizeButtonClass = hasItems ? 'text-green-500' : 'text-blue-500';
        let actionsHTML = `
            <button onclick="openItemizationModal('${expense.id}')" class="${itemizeButtonClass} hover:underline">${itemizeButtonText}</button>
            <button onclick="editExpense('${expense.id}')" class="text-blue-500 hover:underline ml-2">Edit</button>
            <button onclick="deleteExpense('${expense.id}')" class="text-red-500 hover:underline ml-2">Delete</button>
        `;
        row.innerHTML = `
            <td class="border px-4 py-2">${expense.payee}</td>
            <td class="border px-4 py-2">${expense.category} / ${expense.subcategory}</td>
            <td class="border px-4 py-2">${expense.paymentType}</td>
            <td class="border px-4 py-2 text-right">${formatCurrency(expense.amount)}</td>
            <td class="border px-4 py-2">${expense.date}</td>
            <td class="border px-4 py-2 text-center">${actionsHTML}</td>
        `;
    });
    await renderExpenseCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    await updateDashboard();
}
// PART 2 of 3
async function loadSubscriptions(subscriptions) {
    const list = document.getElementById('subscriptionList');
    list.innerHTML = '';
    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const totalCost = activeSubscriptions.reduce((sum, s) => sum + s.amount, 0);
    document.getElementById('totalSubscriptionCost').textContent = formatCurrency(totalCost);
    subscriptions.forEach(sub => {
        const row = list.insertRow();
        row.innerHTML = `
            <td class="border px-4 py-2">${sub.name}</td>
            <td class="border px-4 py-2 text-right">${formatCurrency(sub.amount)}</td>
            <td class="border px-4 py-2">${sub.startDate}</td>
            <td class="border px-4 py-2">${sub.paymentMethod || 'N/A'}</td>
            <td class="border px-4 py-2">${sub.status}</td>
            <td class="border px-4 py-2 text-center">
                 <button onclick="toggleSubscriptionStatus('${sub.id}', '${sub.status}')" class="text-yellow-500 hover:underline">${sub.status === 'active' ? 'Cancel' : 'Reactivate'}</button>
                <button onclick="editSubscription('${sub.id}')" class="text-blue-500 hover:underline ml-2">Edit</button>
                <button onclick="deleteSubscription('${sub.id}')" class="text-red-500 hover:underline ml-2">Delete</button>
            </td>
        `;
    });
    await renderExpenseCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    await updateBudgetSummary();
    await updateDashboard();
}

async function loadBudgets(budgets) {
    const list = document.getElementById('budgetList');
    list.innerHTML = '';

    budgets.forEach(budget => {
        const row = list.insertRow();
        row.innerHTML = `
            <td class="border px-4 py-2">${budget.category}</td>
            <td class="border px-4 py-2">${budget.subcategory}</td>
            <td class="border px-4 py-2">${budget.paymentMethod || 'Any'}</td>
            <td class="border px-4 py-2">${budget.payType || 'Manual'}</td>
            <td class="border px-4 py-2 text-right">${budget.dueDay || 'N/A'}</td>
            <td class="border px-4 py-2 text-right">${formatCurrency(budget.amount)}</td>
            <td class="border px-4 py-2 text-center">
                <button onclick="editBudget('${budget.id}')" class="text-blue-500 hover:underline">Edit</button>
                <button onclick="deleteBudget('${budget.id}')" class="text-red-500 hover:underline ml-2">Delete</button>
            </td>
        `;
    });

    const subscriptionsSnapshot = await getDocs(query(getCollection('subscriptions')));
    const subscriptions = subscriptionsSnapshot.docs.map(doc => doc.data());
    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const totalSubscriptionCost = activeSubscriptions.reduce((sum, s) => sum + s.amount, 0);

    if (totalSubscriptionCost > 0) {
        const row = list.insertRow();
        row.className = 'bg-blue-50 text-gray-600';
        row.innerHTML = `
            <td class="border px-4 py-2 font-semibold">Subscriptions</td>
            <td class="border px-4 py-2">Recurring</td>
            <td class="border px-4 py-2">Various</td>
            <td class="border px-4 py-2">Auto</td>
            <td class="border px-4 py-2 text-right">Varies</td>
            <td class="border px-4 py-2 text-right">${formatCurrency(totalSubscriptionCost)}</td>
            <td class="border px-4 py-2 text-center text-sm text-gray-500">Auto</td>
        `;
    }
    await updateBudgetSummary();
    await updateDashboard();
    feather.replace();
}

async function loadInvestments(investments) {
    const list = document.getElementById('investmentList');
    const totalEl = document.getElementById('totalInvestmentsValue');
    list.innerHTML = '';
    let totalValue = 0;
    investments.forEach(inv => {
        totalValue += inv.total;
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center p-2 border-b';
        item.innerHTML = `
            <span>${inv.name}</span>
            <div>
                <span class="font-bold mr-4">${formatCurrency(inv.total)}</span>
                <button onclick="editInvestment('${inv.id}')" class="text-blue-500 hover:underline">Edit</button>
                <button onclick="deleteInvestment('${inv.id}')" class="text-red-500 hover:underline ml-2">Delete</button>
            </div>
        `;
        list.appendChild(item);
    });
    totalEl.textContent = formatCurrency(totalValue);
    
    if (document.getElementById('reportsView').classList.contains('hidden') === false) {
        await generateReports();
    }
}

async function loadPaymentMethods(methods) {
    const list = document.getElementById('paymentMethodList');
    const selects = [
        document.getElementById('expensePaymentType'),
        document.getElementById('budgetPaymentMethod'),
        document.getElementById('subscriptionPaymentMethod'),
        document.getElementById('pointsCard')
    ];
    list.innerHTML = '';
    selects.forEach(select => {
        select.innerHTML = '<option value="">Select Method</option>';
    });
    methods.forEach(method => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center p-2 border-b';
         li.innerHTML = `
            <span class="flex items-center">
                <i class="h-5 w-5 mr-2 text-gray-500" data-feather="${method.type === 'Credit Card' ? 'credit-card' : 'briefcase'}"></i>
                ${method.name} (${method.type})
            </span>
            <div>
                <button onclick="editPaymentMethod('${method.id}')" class="text-blue-500 hover:underline">Edit</button>
                <button onclick="deletePaymentMethod('${method.id}')" class="text-red-500 hover:underline ml-2">Delete</button>
            </div>
        `;
        list.appendChild(li);
        const option = document.createElement('option');
        option.value = method.name;
        option.textContent = method.name;
        selects.forEach(select => {
            if (select.id === 'pointsCard' && method.type !== 'Credit Card') return;
            select.appendChild(option.cloneNode(true))
        });
    });
     feather.replace();
}

async function loadCategories(categories) {
    const list = document.getElementById('categoryList');
    const selects = [
        document.getElementById('expenseCategory'),
        document.getElementById('budgetCategory'),
        document.getElementById('pointsCategory')
    ];
    list.innerHTML = '';
    selects.forEach(select => {
        select.innerHTML = '<option value="">Select Category</option>';
    });
    const defaultCategories = {
        'Home': 'home', 'Food': 'shopping-cart', 'School': 'book-open', 'Auto': 'truck',
        'Subscriptions': 'repeat', 'Entertainment': 'film', 'Phone': 'smartphone',
        'Internet': 'wifi', 'Projects': 'tool', 'Health': 'heart', 'Shopping': 'tag', 'Travel': 'map-pin'
    };
    categories.forEach(cat => {
         const icon = defaultCategories[cat.name] || 'folder';
        const div = document.createElement('div');
        div.className = 'p-2 border-b';
        let subcategoryHTML = cat.subcategories.map(sub => `
            <li class="flex items-center justify-between">
                <span class="subcategory-name">- ${sub}</span>
                <div>
                    <button onclick="startEditSubcategory(this, '${cat.id}', '${sub}')" class="text-blue-500 text-xs p-1">edit</button>
                    <button onclick="deleteSubcategory('${cat.id}', '${sub}')" class="text-red-500 text-xs p-1">x</button>
                </div>
            </li>`).join('');
        div.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-semibold flex items-center">
                    <i class="h-5 w-5 mr-2 text-gray-500" data-feather="${icon}"></i>
                    <span class="category-name">${cat.name}</span>
                     <button onclick="startEditCategory(this, '${cat.id}')" class="text-blue-500 hover:underline ml-2 text-xs p-1">edit</button>
                </span>
                <button onclick="deleteCategory('${cat.id}')" class="text-red-500 hover:underline">Delete</button>
            </div>
            <form class="subcategoryForm mt-2" data-category-id="${cat.id}">
                <input type="text" placeholder="New Subcategory" class="p-1 border rounded-md text-sm" required>
                <button type="submit" class="px-2 py-1 bg-green-500 text-white rounded-md text-sm">Add</button>
            </form>
            <ul class="ml-4 mt-2">
                ${subcategoryHTML}
            </ul>
        `;
        list.appendChild(div);
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = cat.name;
        selects.forEach(select => select.appendChild(option.cloneNode(true)));
    });
     feather.replace();
}

async function loadPeople(people) {
    const list = document.getElementById('peopleList');
    list.innerHTML = '';
    people.forEach(person => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center p-2 border-b';
        li.innerHTML = `
            <span>${person.name} (Birthday: ${person.birthday})</span>
            <div>
                <button onclick="editPerson('${person.id}')" class="text-blue-500 hover:underline">Edit</button>
                <button onclick="deletePerson('${person.id}')" class="text-red-500 hover:underline ml-2">Delete</button>
            </div>
        `;
        list.appendChild(li);
    });
    updateDashboard();
}

async function loadPoints(points) {
    const list = document.getElementById('pointsList');
    list.innerHTML = '';
    points.forEach(point => {
        const row = list.insertRow();
        row.innerHTML = `
            <td class="border px-4 py-2">${point.category}</td>
            <td class="border px-4 py-2">${point.subcategory}</td>
            <td class="border px-4 py-2">${point.card}</td>
            <td class="border px-4 py-2 text-right">${point.multiplier}x</td>
            <td class="border px-4 py-2 text-center">
                <button onclick="editPoint('${point.id}')" class="text-blue-500 hover:underline">Edit</button>
                <button onclick="deletePoint('${point.id}')" class="text-red-500 hover:underline ml-2">Delete</button>
            </td>
        `;
    });
}

async function loadGroceryItems(items) {
    const listEl = document.getElementById('groceryItemList');
    const dataListEl = document.getElementById('groceryDataList');
    const selectEl = document.getElementById('groceryItemSelect');
    listEl.innerHTML = '';
    dataListEl.innerHTML = '';
    selectEl.innerHTML = '<option value="">Select an item</option>';
    items.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center p-2 border-b';
        li.innerHTML = `
            <span>${item.name}</span>
            <button onclick="deleteGroceryItem('${item.id}')" class="text-red-500 hover:underline">Delete</button>
        `;
        listEl.appendChild(li);
        const option = document.createElement('option');
        option.value = item.name;
        dataListEl.appendChild(option);
        const selectOption = document.createElement('option');
        selectOption.value = item.name;
        selectOption.textContent = item.name;
        selectEl.appendChild(selectOption);
    });
}

async function loadGroceryShoppingLists(lists) {
    const listEl = document.getElementById('shoppingLists');
    listEl.innerHTML = '';
    if (lists.length === 0) {
        listEl.innerHTML = '<p class="text-gray-500">No shopping lists found. Create one above!</p>';
        return;
    }
    lists.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds).forEach(list => {
        const totalCost = list.items.reduce((sum, item) => sum + (item.amount || 0), 0);
        const hasItems = list.items && list.items.length > 0;
        const itemsHTML = hasItems ? list.items.map(item => `<li class="ml-4 text-sm">- ${item.name} (${formatCurrency(item.amount || 0)})</li>`).join('') : '';
        const listDiv = document.createElement('div');
        listDiv.className = 'bg-gray-50 p-4 rounded-lg shadow-sm mb-4';
        listDiv.innerHTML = `
            <div class="flex justify-between items-center">
                <h4 class="font-semibold text-lg">${list.name}</h4>
                <span class="text-sm text-gray-600">${new Date(list.createdAt.seconds * 1000).toLocaleDateString()}</span>
            </div>
            <p class="text-xl font-bold mt-2">Total: ${formatCurrency(totalCost)}</p>
            <p class="font-semibold mt-2">Items:</p>
            <ul class="list-disc list-inside mt-1">${itemsHTML}</ul>
            <div class="flex justify-end gap-2 mt-4">
               <button onclick="editGroceryShoppingList('${list.id}')" class="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600">Edit</button>
               <button onclick="deleteGroceryShoppingList('${list.id}')" class="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600">Delete</button>
            </div>
        `;
        listEl.appendChild(listDiv);
    });
}
// PART 3 of 3
// --- FORM HANDLERS ---
function setupForms() {
    document.getElementById('categoryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const categoryNameInput = document.getElementById('categoryName');
        const categoryName = categoryNameInput.value.trim();
        if (!categoryName) { return; }
        try {
            await addDoc(getCollection('categories'), { name: categoryName, subcategories: [] });
            categoryNameInput.value = '';
            showNotification('Category added.');
        } catch (error) {
            console.error("Error adding category:", error);
            showNotification('Failed to add category.', true);
        }
    });
    document.getElementById('categoryList').addEventListener('submit', async (e) => {
        if (e.target.classList.contains('subcategoryForm')) {
            e.preventDefault();
            const categoryId = e.target.dataset.categoryId;
            const inputElement = e.target.querySelector('input');
            const subcategoryName = inputElement.value.trim();
            if (!categoryId || !subcategoryName) { return; }
            const docRef = doc(getCollection('categories'), categoryId);
            try {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const category = docSnap.data();
                    const currentSubcategories = category.subcategories || [];
                    if (currentSubcategories.includes(subcategoryName)) {
                        showNotification('This subcategory already exists.', true);
                        return;
                    }
                    const updatedSubcategories = [...currentSubcategories, subcategoryName];
                    await updateDoc(docRef, { subcategories: updatedSubcategories });
                    inputElement.value = '';
                    showNotification('Subcategory added successfully.');
                }
            } catch (error) {
                console.error("Error adding subcategory:", error);
            }
        }
    });

    document.getElementById('incomeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const incomeData = {
            name: document.getElementById('incomeName').value,
            source: document.getElementById('incomeSource').value,
            type: document.getElementById('incomeType').value,
            amount: parseFloat(document.getElementById('incomeAmount').value),
            date: document.getElementById('incomeDate').value
        };
        const id = document.getElementById('incomeId').value;
        if (id) {
            await updateDoc(doc(getCollection('income'), id), incomeData);
        } else {
            await addDoc(getCollection('income'), incomeData);
        }
        e.target.reset();
        document.getElementById('incomeId').value = '';
        showNotification('Income saved.');
    });

    document.getElementById('expenseForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const expenseData = {
            payee: document.getElementById('expensePayee').value,
            category: document.getElementById('expenseCategory').value,
            subcategory: document.getElementById('expenseSubcategory').value,
            paymentType: document.getElementById('expensePaymentType').value,
            amount: parseFloat(document.getElementById('expenseAmount').value),
            date: document.getElementById('expenseDate').value,
            notes: document.getElementById('expenseNotes').value,
        };
        const id = document.getElementById('expenseId').value;
        if (id) {
            const docRef = doc(getCollection('expenses'), id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                expenseData.items = docSnap.data().items || [];
            }
            await updateDoc(docRef, expenseData);
        } else {
            expenseData.items = [];
            await addDoc(getCollection('expenses'), expenseData);
        }
        e.target.reset();
        document.getElementById('expenseId').value = '';
        showNotification('Expense saved.');
    });
    
    document.getElementById('investmentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const investmentData = {
            name: document.getElementById('investmentName').value,
            total: parseFloat(document.getElementById('investmentTotal').value),
        };
        const id = document.getElementById('investmentId').value;
        if (id) {
            await updateDoc(doc(getCollection('investments'), id), investmentData);
            showNotification('Investment account updated.');
        } else {
            await addDoc(getCollection('investments'), investmentData);
            showNotification('Investment account added.');
        }
        e.target.reset();
        document.getElementById('investmentId').value = '';
    });

    document.getElementById('subscriptionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('subscriptionId').value;
        const subscriptionData = {
            name: document.getElementById('subscriptionName').value,
            amount: parseFloat(document.getElementById('subscriptionAmount').value),
            startDate: document.getElementById('subscriptionStartDate').value,
            paymentMethod: document.getElementById('subscriptionPaymentMethod').value,
        };
        if (id) {
            await updateDoc(doc(getCollection('subscriptions'), id), subscriptionData);
        } else {
            subscriptionData.status = 'active';
            await addDoc(getCollection('subscriptions'), subscriptionData);
        }
        e.target.reset();
        document.getElementById('subscriptionId').value = '';
        showNotification('Subscription saved.');
    });

    document.getElementById('budgetForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const budgetData = {
            category: document.getElementById('budgetCategory').value,
            subcategory: document.getElementById('budgetSubcategory').value,
            amount: parseFloat(document.getElementById('budgetAmount').value),
            paymentMethod: document.getElementById('budgetPaymentMethod').value,
            payType: document.getElementById('budgetPayType').value,
            dueDay: parseInt(document.getElementById('budgetDueDay').value) || null,
        };
        const id = document.getElementById('budgetId').value;
        if(id){
            await updateDoc(doc(getCollection('budgets'), id), budgetData);
        } else {
            await addDoc(getCollection('budgets'), budgetData);
        }
        e.target.reset();
        document.getElementById('budgetId').value = '';
        showNotification('Budget saved.');
    });

    document.getElementById('paymentMethodForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const paymentMethodData = {
            name: document.getElementById('paymentMethodName').value,
            type: document.getElementById('paymentMethodType').value
        };
        const id = document.getElementById('paymentMethodId').value;
        if (id) {
            await updateDoc(doc(getCollection('paymentMethods'), id), paymentMethodData);
        } else {
            await addDoc(getCollection('paymentMethods'), paymentMethodData);
        }
        e.target.reset();
        document.getElementById('paymentMethodId').value = '';
        showNotification('Payment method saved.');
    });

    document.getElementById('personForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const personData = {
            name: document.getElementById('personName').value,
            birthday: document.getElementById('personBirthday').value
        };
        const id = document.getElementById('personId').value;
        if (id) {
            await updateDoc(doc(getCollection('people'), id), personData);
        } else {
            await addDoc(getCollection('people'), personData);
        }
        e.target.reset();
        document.getElementById('personId').value = '';
        showNotification('Person saved.');
    });

    document.getElementById('groceryItemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const itemName = document.getElementById('newGroceryItemName').value;
        await addDoc(getCollection('groceryItems'), { name: itemName });
        e.target.reset();
        showNotification('Grocery item added.');
    });

    document.getElementById('pointsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pointsData = {
            category: document.getElementById('pointsCategory').value,
            subcategory: document.getElementById('pointsSubcategory').value,
            card: document.getElementById('pointsCard').value,
            multiplier: parseFloat(document.getElementById('pointsMultiplier').value)
        };
        const id = document.getElementById('pointsId').value;
        if (id) {
            await updateDoc(doc(getCollection('creditCardPoints'), id), pointsData);
        } else {
            await addDoc(getCollection('creditCardPoints'), pointsData);
        }
        e.target.reset();
        document.getElementById('pointsId').value = '';
        showNotification('Point rule saved.');
    });

    document.getElementById('createShoppingListForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const listName = document.getElementById('shoppingListName').value;
        const itemsRaw = document.getElementById('shoppingListItems').value;
        if (!listName || !itemsRaw) {
            showNotification('Please enter a list name and at least one item.', true);
            return;
        }
        const items = itemsRaw.split('\n').map(line => {
            const [name, amount] = line.split(',');
            return { name: name.trim(), amount: parseFloat(amount) || 0 };
        }).filter(item => item.name);
        
        const listId = document.getElementById('shoppingListId').value;
        const shoppingList = {
            name: listName,
            items: items,
        };

        if (listId) {
            await updateDoc(doc(getCollection('groceryShoppingLists'), listId), shoppingList);
            showNotification('Shopping list updated!');
        } else {
            shoppingList.createdAt = serverTimestamp();
            await addDoc(getCollection('groceryShoppingLists'), shoppingList);
            showNotification('Shopping list created!');
        }
        e.target.reset();
        document.getElementById('shoppingListId').value = '';
        document.getElementById('createShoppingListForm').querySelector('button[type="submit"]').textContent = 'Save List';
    });
    
    document.getElementById('cancelEditListBtn').addEventListener('click', () => {
        document.getElementById('createShoppingListForm').reset();
        document.getElementById('shoppingListId').value = '';
        document.getElementById('createShoppingListForm').querySelector('button[type="submit"]').textContent = 'Save List';
    });

    document.getElementById('exportButton').addEventListener('click', exportData);
    document.getElementById('importFile').addEventListener('change', importData);
    document.getElementById('importCsvFile').addEventListener('change', importCsvData);

    document.getElementById('expenseCategory').addEventListener('change', (e) => handleCategoryChange(e.target.value, 'expenseSubcategory'));
    document.getElementById('budgetCategory').addEventListener('change', (e) => handleCategoryChange(e.target.value, 'budgetSubcategory'));
    document.getElementById('pointsCategory').addEventListener('change', (e) => handleCategoryChange(e.target.value, 'pointsSubcategory'));

    document.getElementById('toggleCalendarBtn').addEventListener('click', () => {
        const calendarContainer = document.getElementById('calendarContainer');
        const btn = document.getElementById('toggleCalendarBtn');
        calendarContainer.classList.toggle('hidden');
        btn.textContent = calendarContainer.classList.contains('hidden') ? 'View Calendar' : 'Hide Calendar';
    });

    document.getElementById('reportMonth').addEventListener('change', generateReports);
    document.getElementById('reportYear').addEventListener('change', generateYearlyReports);
    document.getElementById('groceryItemSelect').addEventListener('change', generateYearlyReports);
}

// --- EDIT AND DELETE FUNCTIONS ---

// Income
async function editIncome(id) {
    const docSnap = await getDoc(doc(getCollection('income'), id));
    if (docSnap.exists()) {
        const income = { id: docSnap.id, ...docSnap.data() };
        document.getElementById('incomeId').value = income.id;
        document.getElementById('incomeName').value = income.name;
        document.getElementById('incomeSource').value = income.source;
        document.getElementById('incomeType').value = income.type;
        document.getElementById('incomeAmount').value = income.amount;
        document.getElementById('incomeDate').value = income.date;
    }
}
async function deleteIncome(id) {
    showConfirmation('Delete Income', 'Are you sure you want to delete this income source?', async () => {
        await deleteDoc(doc(getCollection('income'), id));
        showNotification('Income source deleted.');
    });
}

// Expense
async function editExpense(id) {
    const docSnap = await getDoc(doc(getCollection('expenses'), id));
    if (docSnap.exists()) {
        const expense = { id: docSnap.id, ...docSnap.data() };
        document.getElementById('expenseId').value = expense.id;
        document.getElementById('expensePayee').value = expense.payee;
        document.getElementById('expenseCategory').value = expense.category;
        await handleCategoryChangeForEdit(expense.category, expense.subcategory, 'expenseSubcategory');
        document.getElementById('expensePaymentType').value = expense.paymentType;
        document.getElementById('expenseAmount').value = expense.amount;
        document.getElementById('expenseDate').value = expense.date;
        document.getElementById('expenseNotes').value = expense.notes || '';
    }
}
async function deleteExpense(id) {
    showConfirmation('Delete Expense', 'Are you sure you want to delete this expense?', async () => {
        await deleteDoc(doc(getCollection('expenses'), id));
        showNotification('Expense deleted.');
    });
}

// Investment
async function editInvestment(id) {
    const docSnap = await getDoc(doc(getCollection('investments'), id));
    if (docSnap.exists()) {
        const investment = { id: docSnap.id, ...docSnap.data() };
        document.getElementById('investmentId').value = investment.id;
        document.getElementById('investmentName').value = investment.name;
        document.getElementById('investmentTotal').value = investment.total;
    }
}
async function deleteInvestment(id) {
    showConfirmation('Delete Investment Account', 'Are you sure?', async () => {
        await deleteDoc(doc(getCollection('investments'), id));
        showNotification('Investment account deleted.');
    });
}

// Subscription
async function editSubscription(id) {
    const docSnap = await getDoc(doc(getCollection('subscriptions'), id));
    if (docSnap.exists()) {
        const sub = { id: docSnap.id, ...docSnap.data() };
        document.getElementById('subscriptionId').value = sub.id;
        document.getElementById('subscriptionName').value = sub.name;
        document.getElementById('subscriptionAmount').value = sub.amount;
        document.getElementById('subscriptionStartDate').value = sub.startDate;
        document.getElementById('subscriptionPaymentMethod').value = sub.paymentMethod;
    }
}
async function deleteSubscription(id) {
    showConfirmation('Delete Subscription', 'Are you sure?', async () => {
        await deleteDoc(doc(getCollection('subscriptions'), id));
        showNotification('Subscription deleted.');
    });
}
async function toggleSubscriptionStatus(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'cancelled' : 'active';
    await updateDoc(doc(getCollection('subscriptions'), id), { status: newStatus });
    showNotification(`Subscription status changed to ${newStatus}.`);
}

// Budget
async function editBudget(id) {
    const docSnap = await getDoc(doc(getCollection('budgets'), id));
    if (docSnap.exists()) {
        const budget = { id: docSnap.id, ...docSnap.data() };
        document.getElementById('budgetId').value = budget.id;
        document.getElementById('budgetCategory').value = budget.category;
        await handleCategoryChangeForEdit(budget.category, budget.subcategory, 'budgetSubcategory');
        document.getElementById('budgetAmount').value = budget.amount;
        document.getElementById('budgetPaymentMethod').value = budget.paymentMethod;
        document.getElementById('budgetPayType').value = budget.payType;
        document.getElementById('budgetDueDay').value = budget.dueDay;
    }
}
async function deleteBudget(id) {
    showConfirmation('Delete Budget', 'Are you sure?', async () => {
        await deleteDoc(doc(getCollection('budgets'), id));
        showNotification('Budget deleted.');
    });
}

// Payment Method
async function editPaymentMethod(id) {
    const docSnap = await getDoc(doc(getCollection('paymentMethods'), id));
    if (docSnap.exists()) {
        const method = { id: docSnap.id, ...docSnap.data() };
        document.getElementById('paymentMethodId').value = method.id;
        document.getElementById('paymentMethodName').value = method.name;
        document.getElementById('paymentMethodType').value = method.type;
    }
}
async function deletePaymentMethod(id) {
    showConfirmation('Delete Payment Method', 'Are you sure?', async () => {
        await deleteDoc(doc(getCollection('paymentMethods'), id));
        showNotification('Payment method deleted.');
    });
}

// Category & Subcategory
async function deleteCategory(id) {
    showConfirmation('Delete Category', 'This will delete the category and all its subcategories. Are you sure?', async () => {
        await deleteDoc(doc(getCollection('categories'), id));
        showNotification('Category deleted.');
    });
}
async function deleteSubcategory(categoryId, subcategoryName) {
    showConfirmation('Delete Subcategory', 'Are you sure?', async () => {
        const docRef = doc(getCollection('categories'), categoryId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const category = docSnap.data();
            const updatedSubcategories = category.subcategories.filter(s => s !== subcategoryName);
            await updateDoc(docRef, { subcategories: updatedSubcategories });
            showNotification('Subcategory deleted.');
        }
    });
}

// People
async function editPerson(id) {
    const docSnap = await getDoc(doc(getCollection('people'), id));
    if (docSnap.exists()) {
        const person = { id: docSnap.id, ...docSnap.data() };
        document.getElementById('personId').value = person.id;
        document.getElementById('personName').value = person.name;
        document.getElementById('personBirthday').value = person.birthday;
        document.getElementById('personForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
async function deletePerson(id) {
    showConfirmation('Delete Person', 'Are you sure?', async () => {
        await deleteDoc(doc(getCollection('people'), id));
        showNotification('Person deleted.');
    });
}

// Points
async function editPoint(id) {
    const docSnap = await getDoc(doc(getCollection('creditCardPoints'), id));
    if (docSnap.exists()) {
        const point = { id: docSnap.id, ...docSnap.data() };
        document.getElementById('pointsId').value = point.id;
        document.getElementById('pointsCategory').value = point.category;
        await handleCategoryChangeForEdit(point.category, point.subcategory, 'pointsSubcategory');
        document.getElementById('pointsCard').value = point.card;
        document.getElementById('pointsMultiplier').value = point.multiplier;
    }
}
async function deletePoint(id) {
    showConfirmation('Delete Point Rule', 'Are you sure?', async () => {
        await deleteDoc(doc(getCollection('creditCardPoints'), id));
        showNotification('Point rule deleted.');
    });
}

// Grocery Items & Lists
async function deleteGroceryItem(id) {
    showConfirmation('Delete Grocery Item', 'Are you sure?', async () => {
        await deleteDoc(doc(getCollection('groceryItems'), id));
        showNotification('Grocery item deleted.');
    });
}
async function editGroceryShoppingList(id) {
    const docSnap = await getDoc(doc(getCollection('groceryShoppingLists'), id));
    if (docSnap.exists()) {
        const list = { id: docSnap.id, ...docSnap.data() };
        document.getElementById('shoppingListId').value = list.id;
        document.getElementById('shoppingListName').value = list.name;
        const itemsText = list.items.map(item => `${item.name}, ${item.amount}`).join('\n');
        document.getElementById('shoppingListItems').value = itemsText;
        document.getElementById('createShoppingListForm').querySelector('button[type="submit"]').textContent = 'Update List';
    }
}
async function deleteGroceryShoppingList(id) {
    showConfirmation('Delete Shopping List', 'Are you sure you want to delete this list?', async () => {
        await deleteDoc(doc(getCollection('groceryShoppingLists'), id));
        showNotification('Shopping list deleted.');
    });
}
// --- UTILITIES ---
function setupTableSorting() {
    document.querySelectorAll('th[data-sort]').forEach(headerCell => {
        headerCell.addEventListener('click', () => {
            const tableElement = headerCell.closest('table');
            const tbody = tableElement.querySelector('tbody');
            const columnKey = headerCell.dataset.sort;
            if (currentSort.column === columnKey) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort = { column: columnKey, direction: 'asc' };
            }
            document.querySelectorAll('th[data-sort]').forEach(th => {
                th.classList.remove('sort-asc', 'sort-desc');
            });
            headerCell.classList.toggle('sort-asc', currentSort.direction === 'asc');
            headerCell.classList.toggle('sort-desc', currentSort.direction === 'desc');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const headerIndex = Array.from(headerCell.parentNode.children).indexOf(headerCell);
            rows.sort((a, b) => {
                let valA = a.children[headerIndex].textContent.trim();
                let valB = b.children[headerIndex].textContent.trim();
                if (valA.startsWith('$')) {
                    valA = parseFloat(valA.replace(/[$,]/g, ''));
                    valB = parseFloat(valB.replace(/[$,]/g, ''));
                } else if (!isNaN(Date.parse(valA)) && !isNaN(Date.parse(valB))) {
                    valA = new Date(valA);
                    valB = new Date(valB);
                }
                if (!isNaN(valA) && !isNaN(valB) && typeof valA !== 'object') {
                     return currentSort.direction === 'asc' ? valA - valB : valB - valA;
                }
                if (valA instanceof Date && valB instanceof Date) {
                     return currentSort.direction === 'asc' ? valA - valB : valB - valA;
                }
                return currentSort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            });
            tbody.innerHTML = '';
            rows.forEach(row => tbody.appendChild(row));
        });
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount || 0);
}

function setupHamburgerMenu() {
    document.getElementById('hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('-translate-x-full');
    });
}

function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    const messageEl = document.getElementById('notificationMessage');
    messageEl.textContent = message;
    notification.className = notification.className.replace(/bg-gray-800|bg-red-600/g, '');
    notification.classList.add(isError ? 'bg-red-600' : 'bg-gray-800');
    notification.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        notification.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

function showConfirmation(title, message, onConfirm) {
    const modal = document.getElementById('confirmationModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');
    const confirmHandler = () => {
        onConfirm();
        closeModal('confirmationModal');
    };
    const cancelHandler = () => closeModal('confirmationModal');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', confirmHandler, { once: true });
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', cancelHandler, { once: true });
    modal.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

async function renderExpenseCalendar(year, month) {
    const calendarHeader = document.getElementById('calendarHeader');
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarHeader || !calendarGrid) return;
    const expensesSnapshot = await getDocs(query(getCollection('expenses')));
    const subscriptionsSnapshot = await getDocs(query(getCollection('subscriptions')));
    const allExpenses = expensesSnapshot.docs.map(doc => doc.data());
    const allSubscriptions = subscriptionsSnapshot.docs.map(doc => doc.data());
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    calendarHeader.textContent = `${firstDay.toLocaleString('default', { month: 'long' })} ${year}`;
    const dailyItems = {};
    const monthString = `${year}-${(month + 1).toString().padStart(2, '0')}`;
    allExpenses
        .filter(e => e.date.startsWith(monthString))
        .forEach(e => {
            const day = new Date(e.date + 'T00:00:00').getDate();
            if (!dailyItems[day]) {
                dailyItems[day] = [];
            }
            dailyItems[day].push(e);
        });
    allSubscriptions
        .filter(s => s.status === 'active')
        .forEach(s => {
            const subDay = new Date(s.startDate + 'T00:00:00').getDate();
            if (subDay <= daysInMonth) {
                 if (!dailyItems[subDay]) {
                    dailyItems[subDay] = [];
                }
                dailyItems[subDay].push({ payee: s.name, amount: s.amount, isSubscription: true });
            }
        });
    calendarGrid.innerHTML = '';
    for (let i = 0; i < startingDay; i++) {
        calendarGrid.innerHTML += `<div class="border p-2 bg-gray-50 rounded-md"></div>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const itemsForDay = dailyItems[day] || [];
        let itemsHTML = '';
        if (itemsForDay.length > 0) {
            itemsHTML = '<ul class="text-xs text-left mt-1 space-y-0.5 overflow-y-auto max-h-16">';
            itemsForDay.forEach(item => {
                const colorClass = item.isSubscription ? 'text-blue-600' : 'text-red-600';
                itemsHTML += `<li class="truncate ${colorClass}"><span class="font-semibold">${formatCurrency(item.amount)}</span> ${item.payee}</li>`;
            });
            itemsHTML += '</ul>';
        }
        let cellHTML = `<div class="border p-2 h-28 flex flex-col bg-white rounded-md">
                          <span class="font-semibold">${day}</span>
                          ${itemsHTML}
                      </div>`;
        calendarGrid.innerHTML += cellHTML;
    }
}

function setupCalendarNav() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderExpenseCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderExpenseCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    });
}

async function handleCategoryChange(categoryName, subcategorySelectId) {
    const categoriesSnapshot = await getDocs(query(getCollection('categories')));
    const categories = categoriesSnapshot.docs.map(doc => doc.data());
    const selectedCategory = categories.find(c => c.name === categoryName);
    const subcategorySelect = document.getElementById(subcategorySelectId);
    subcategorySelect.innerHTML = '<option value="">Select Subcategory</option>';
    if (selectedCategory) {
        selectedCategory.subcategories.forEach(sub => {
            const option = document.createElement('option');
            option.value = sub;
            option.textContent = sub;
            subcategorySelect.appendChild(option);
        });
    }
}

async function handleCategoryChangeForEdit(categoryName, subcategoryNameToSelect, subcategorySelectId) {
    await handleCategoryChange(categoryName, subcategorySelectId);
    const subcategorySelect = document.getElementById(subcategorySelectId);
    if(subcategoryNameToSelect) {
        subcategorySelect.value = subcategoryNameToSelect;
    }
}

// Inline Editing for Categories/Subcategories
function startEditCategory(button, categoryId) {
    const span = button.closest('span').querySelector('.category-name');
    const currentName = span.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'p-1 border rounded-md text-sm';
    input.onblur = () => saveCategory(categoryId, input);
    input.onkeydown = (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            const originalSpan = document.createElement('span');
            originalSpan.className = 'category-name';
            originalSpan.textContent = currentName;
            input.replaceWith(originalSpan);
        }
    };
    span.replaceWith(input);
    input.focus();
    input.select();
}
async function saveCategory(categoryId, input) {
    const newName = input.value;
    await updateDoc(doc(getCollection('categories'), categoryId), { name: newName });
}
function startEditSubcategory(button, categoryId, oldName) {
    const span = button.closest('li').querySelector('.subcategory-name');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'p-1 border rounded-md text-sm w-32';
    input.onblur = () => saveSubcategory(categoryId, oldName, input);
    input.onkeydown = (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') span.textContent = `- ${oldName}`;
    };
    span.textContent = '- ';
    span.appendChild(input);
    input.focus();
    input.select();
}
async function saveSubcategory(categoryId, oldName, input) {
    const newName = input.value;
    const docRef = doc(getCollection('categories'), categoryId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const category = docSnap.data();
        const subIndex = category.subcategories.indexOf(oldName);
        if (subIndex > -1) {
            const updatedSubcategories = [...category.subcategories];
            updatedSubcategories[subIndex] = newName;
            await updateDoc(docRef, { subcategories: updatedSubcategories });
        }
    }
}

async function exportData() {
    try {
        const stores = ['income', 'expenses', 'subscriptions', 'budgets', 'paymentMethods', 'categories', 'people', 'groceryItems', 'creditCardPoints', 'groceryShoppingLists', 'investments'];
        const exportObject = {};
        for (const storeName of stores) {
            const snapshot = await getDocs(query(getCollection(storeName)));
            exportObject[storeName] = snapshot.docs.map(doc => ({ ...doc.data() })); // Don't export the ID
        }
        const jsonString = JSON.stringify(exportObject, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `home-budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Data exported successfully!');
    } catch (error) {
        console.error('Error exporting data:', error);
        showNotification('Failed to export data.', true);
    }
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const onConfirmImport = () => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const stores = ['income', 'expenses', 'subscriptions', 'budgets', 'paymentMethods', 'categories', 'people', 'groceryItems', 'creditCardPoints', 'groceryShoppingLists', 'investments'];
                
                const batch = writeBatch(db);

                for (const storeName of stores) {
                    const collectionRef = getCollection(storeName);
                    const existingDocs = await getDocs(query(collectionRef));
                    existingDocs.docs.forEach(d => batch.delete(d.ref));
                }
                await batch.commit();

                const importBatch = writeBatch(db);
                for (const storeName of stores) {
                    if (data[storeName] && Array.isArray(data[storeName])) {
                        const collectionRef = getCollection(storeName);
                        data[storeName].forEach(item => {
                            const newDocRef = doc(collectionRef); // Generate new doc with new ID
                            importBatch.set(newDocRef, item);
                        });
                    }
                }
                await importBatch.commit();
                showNotification('Data imported successfully!');
            } catch (error) {
                console.error('Error importing data:', error);
                showNotification(`Import failed: ${error.message}`, true);
            }
        };
        reader.readAsText(file);
    };
    showConfirmation('Import JSON Data', 'This will overwrite all current data. Are you sure?', onConfirmImport);
    event.target.value = null;
}

function importCsvData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const onConfirmImport = () => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const expenses = results.data;
                const batch = writeBatch(db);
                const expensesRef = getCollection('expenses');
                expenses.forEach(row => {
                    if (row.Date && row.Payee && row.Category && row.Amount) {
                        const expenseData = {
                            date: row.Date.trim(),
                            payee: row.Payee.trim(),
                            category: row.Category.trim(),
                            subcategory: row.Subcategory ? row.Subcategory.trim() : 'Uncategorized',
                            paymentType: row['Payment Type'] ? row['Payment Type'].trim() : 'Unknown',
                            amount: parseFloat(row.Amount) || 0,
                            notes: row.Notes ? row.Notes.trim() : '',
                            items: []
                        };
                        const newDocRef = doc(expensesRef);
                        batch.set(newDocRef, expenseData);
                    }
                });
                try {
                    await batch.commit();
                    showNotification('CSV data imported successfully!');
                } catch (error) {
                     console.error('Error importing CSV:', error);
                     showNotification(`CSV Import failed: ${error.message}`, true);
                }
            },
            error: (err) => {
                console.error('PapaParse error:', err);
                showNotification('Error parsing CSV file.', true);
            }
        });
    };
    showConfirmation('Import CSV Expenses', 'This will add new expenses from the CSV. Required columns: Date,Payee,Category,Subcategory,"Payment Type",Amount,Notes', onConfirmImport);
    event.target.value = null;
}
// --- DASHBOARD & REPORTS LOGIC ---
async function updateDashboard() {
    if (!initialDataLoaded) return;
    const expenses = (await getDocs(query(getCollection('expenses')))).docs.map(doc => doc.data());
    const people = (await getDocs(query(getCollection('people')))).docs.map(doc => doc.data());
    const budgets = (await getDocs(query(getCollection('budgets')))).docs.map(doc => doc.data());
    const subscriptions = (await getDocs(query(getCollection('subscriptions')))).docs.map(doc => doc.data());
    
    updateDashboardSummaryCards(budgets, subscriptions, expenses);
    renderDashboardTransactions(budgets, subscriptions, expenses);
    updateDashboardDesktopBudgets(budgets, subscriptions, expenses);
    updateDashboardBirthdays(people);
    updateDashboardSpendByCategory(expenses);
}

function updateDashboardSummaryCards(budgets, subscriptions, expenses) {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const totalBudgetedFromBudgets = budgets.reduce((sum, item) => sum + item.amount, 0);
    const totalBudgetedFromSubs = subscriptions.filter(s => s.status === 'active').reduce((sum, item) => sum + item.amount, 0);
    const totalBudgeted = totalBudgetedFromBudgets + totalBudgetedFromSubs;

    const totalSpent = expenses
        .filter(e => e.date.startsWith(currentMonthStr))
        .reduce((sum, e) => sum + e.amount, 0);
        
    const remaining = totalBudgeted - totalSpent;

    document.getElementById('summaryBudgeted').textContent = formatCurrency(totalBudgeted);
    document.getElementById('summarySpent').textContent = formatCurrency(totalSpent);
    document.getElementById('summaryRemaining').textContent = formatCurrency(remaining);
    
    document.getElementById('desktopBudgeted').textContent = formatCurrency(totalBudgeted);
    document.getElementById('desktopSpent').textContent = formatCurrency(totalSpent);
    document.getElementById('desktopRemaining').textContent = formatCurrency(remaining);
    
    const remainingElements = [document.getElementById('summaryRemaining'), document.getElementById('desktopRemaining')];
    remainingElements.forEach(el => {
        el.classList.remove('text-green-600', 'text-red-600');
        if (remaining >= 0) {
            el.classList.add('text-green-600');
        } else {
            el.classList.add('text-red-600');
        }
    });
}


async function updateBudgetSummary() {
    const allBudgets = (await getDocs(query(getCollection('budgets')))).docs.map(doc => doc.data());
    const allIncome = (await getDocs(query(getCollection('income')))).docs.map(doc => doc.data());
    const allSubscriptions = (await getDocs(query(getCollection('subscriptions')))).docs.map(doc => doc.data());
    
    const userBudgeted = allBudgets.reduce((sum, b) => sum + b.amount, 0);
    const activeSubscriptions = allSubscriptions.filter(s => s.status === 'active');
    const subscriptionCosts = activeSubscriptions.reduce((sum, s) => sum + s.amount, 0);
    const totalBudgeted = userBudgeted + subscriptionCosts;
    
    const recurringIncome = allIncome
        .filter(i => i.type === 'recurring')
        .reduce((sum, i) => sum + i.amount, 0);
        
    const remaining = recurringIncome - totalBudgeted;
    
    document.getElementById('summaryRecurringIncome').textContent = formatCurrency(recurringIncome);
    document.getElementById('summaryTotalBudgeted').textContent = formatCurrency(totalBudgeted);
    document.getElementById('summaryBudgetRemaining').textContent = formatCurrency(remaining);
    
    const remainingEl = document.getElementById('summaryBudgetRemaining');
    const remainingContainer = remainingEl.parentElement;
    remainingContainer.className = remainingContainer.className.replace(/bg-blue-100|bg-red-100/g, '');
    remainingEl.className = remainingEl.className.replace(/text-blue-600|text-red-600/g, '');
    const textEl = remainingContainer.parentElement.querySelector('.text-sm');
    textEl.className = textEl.className.replace(/text-blue-800|text-red-800/g, '');
    
    if (remaining >= 0) {
        remainingContainer.classList.add('bg-blue-100');
        remainingEl.classList.add('text-blue-600');
        textEl.classList.add('text-blue-800');
    } else {
        remainingContainer.classList.add('bg-red-100');
        remainingEl.classList.add('text-red-600');
        textEl.classList.add('text-red-800');
    }

    const paymentTotals = {};
    allBudgets.forEach(b => {
        const method = b.paymentMethod || 'Unassigned';
        paymentTotals[method] = (paymentTotals[method] || 0) + b.amount;
    });
    activeSubscriptions.forEach(s => {
        const method = s.paymentMethod || 'Unassigned';
        paymentTotals[method] = (paymentTotals[method] || 0) + s.amount;
    });

    const summaryEl = document.getElementById('budgetPaymentMethodSummary');
    summaryEl.innerHTML = '<h3 class="text-xl font-semibold mb-2">Budgeted by Payment Method</h3>';
    const list = document.createElement('div');
    list.className = 'grid grid-cols-2 md:grid-cols-4 gap-2 text-sm';
    for (const method in paymentTotals) {
        const item = document.createElement('div');
        item.className = 'bg-gray-100 p-2 rounded-md';
        item.innerHTML = `<p class="font-semibold">${method}</p><p>${formatCurrency(paymentTotals[method])}</p>`;
        list.appendChild(item);
    }
    summaryEl.appendChild(list);
}

async function renderDashboardTransactions(budgets, subscriptions, expenses) {
    const mobileList = document.getElementById('mobileTransactionsList');
    const desktopList = document.getElementById('desktopTransactionsList');
    mobileList.innerHTML = '';
    desktopList.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    let transactions = [];
    
    budgets.forEach(b => {
        if (b.dueDay) {
            const dueDate = new Date(today.getFullYear(), today.getMonth(), b.dueDay);
            if (dueDate >= today && dueDate <= endOfMonth) {
                transactions.push({
                    date: dueDate.toISOString().slice(0, 10),
                    description: `${b.category} / ${b.subcategory}`,
                    amount: b.amount,
                    type: 'upcoming'
                });
            }
        }
    });

    const activeSubs = subscriptions.filter(s => s.status === 'active');
    activeSubs.forEach(s => {
        const subDate = new Date(s.startDate);
        const subDay = subDate.getDate();
        let nextDueDate = new Date(today.getFullYear(), today.getMonth(), subDay);
        if(nextDueDate < today) {
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        }
        if (nextDueDate >= today && nextDueDate <= endOfMonth) {
             transactions.push({
                date: nextDueDate.toISOString().slice(0, 10),
                description: s.name,
                amount: s.amount,
                type: 'upcoming'
            });
        }
    });

    expenses.forEach(e => {
        const expenseDate = new Date(e.date + 'T00:00:00');
        if (expenseDate <= today && expenseDate >= sevenDaysAgo) {
            transactions.push({
                date: e.date,
                description: e.payee,
                amount: e.amount,
                type: 'recent'
            });
        }
    });
    
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const grouped = transactions.reduce((acc, t) => {
        (acc[t.date] = acc[t.date] || []).push(t);
        return acc;
    }, {});
    
    let html = '';
    if (Object.keys(grouped).length === 0) {
        html = '<p class="text-gray-500">No recent or upcoming transactions.</p>';
    } else {
         for (const dateStr in grouped) {
            const date = new Date(dateStr + 'T00:00:00');
            const isToday = date.toDateString() === today.toDateString();
            const dateHeader = isToday ? 'Today' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            html += `<div class="mt-4"><p class="font-bold text-gray-700">${dateHeader}</p><ul class="mt-1 space-y-2">`;
            grouped[dateStr].forEach(t => {
                const amountClass = t.type === 'upcoming' ? 'text-yellow-600' : 'text-red-600';
                 html += `
                    <li class="flex justify-between items-center bg-white p-2 rounded-md shadow-sm">
                        <span>${t.description}</span>
                        <span class="font-semibold ${amountClass}">${formatCurrency(t.amount)}</span>
                    </li>
                `;
            });
            html += '</ul></div>';
         }
    }
    mobileList.innerHTML = html;
    desktopList.innerHTML = html;
}

async function updateDashboardSpendByCategory(allExpenses) {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    const monthlyExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthStr));
    
    const spendByCategory = monthlyExpenses.reduce((acc, expense) => {
        acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
        return acc;
    }, {});
    
    const totalSpend = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
    const sortedCategories = Object.entries(spendByCategory).sort(([,a],[,b]) => b-a);
    
    const renderContainer = (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        if (sortedCategories.length > 0) {
            sortedCategories.forEach(([category, amount]) => {
                const percentage = totalSpend > 0 ? (amount / totalSpend) * 100 : 0;
                const div = document.createElement('div');
                div.innerHTML = `
                    <div class="flex justify-between mb-1">
                        <span class="font-semibold text-sm">${category}</span>
                        <span class="text-sm">${formatCurrency(amount)}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full" style="width: ${percentage}%"></div>
                    </div>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<p class="text-gray-500">No spending this month.</p>';
        }
    };
    renderContainer('desktopSpendByCategory');
    renderContainer('mobileSpendByCategory');
}

function updateDashboardDesktopBudgets(budgets, subscriptions, expenses) {
    const desktopBudgetsEl = document.getElementById('desktopBudgets');
    if (!desktopBudgetsEl) return;
    desktopBudgetsEl.innerHTML = '';
    
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    const monthlyExpenses = expenses.filter(e => e.date.startsWith(currentMonthStr));
    const allActiveSubs = subscriptions.filter(s => s.status === 'active');
    
    budgets.forEach(budget => {
        const actualSpend = monthlyExpenses
            .filter(e => e.category === budget.category && e.subcategory === budget.subcategory)
            .reduce((sum, e) => sum + e.amount, 0);
        const percentage = budget.amount > 0 ? (actualSpend / budget.amount) * 100 : 0;
        const div = document.createElement('div');
        div.innerHTML = `
            <div class="flex justify-between mb-1">
                <span class="font-semibold">${budget.category} / ${budget.subcategory}</span>
                <span>${formatCurrency(actualSpend)} / ${formatCurrency(budget.amount)}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5">
                <div class="bg-green-600 h-2.5 rounded-full" style="width: ${Math.min(percentage, 100)}%"></div>
            </div>
        `;
        desktopBudgetsEl.appendChild(div);
    });

    const subCost = allActiveSubs.reduce((sum, s) => sum + s.amount, 0);
     if (subCost > 0) {
        const div = document.createElement('div');
        div.innerHTML = `
            <div class="flex justify-between mb-1">
                <span class="font-semibold">Subscriptions</span>
                <span>${formatCurrency(subCost)}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5">
                <div class="bg-blue-600 h-2.5 rounded-full" style="width: 100%"></div>
            </div>
        `;
        desktopBudgetsEl.appendChild(div);
    }
}

function updateDashboardBirthdays(people) {
    const upcomingBirthdaysList = document.getElementById('upcomingBirthdays');
    if (!upcomingBirthdaysList) return;
    upcomingBirthdaysList.innerHTML = '';

    const today = new Date();
    const upcoming = people.filter(p => {
        if (!p.birthday) return false;
        const birthday = new Date(p.birthday + 'T00:00:00');
        birthday.setFullYear(today.getFullYear());
        const diff = birthday.getTime() - today.getTime();
        return diff >= 0 && diff < (30 * 24 * 60 * 60 * 1000); // within the next 30 days
    }).sort((a,b) => {
        let aDate = new Date(a.birthday);
        aDate.setFullYear(today.getFullYear());
        let bDate = new Date(b.birthday);
        bDate.setFullYear(today.getFullYear());
        return aDate - bDate;
    });

    if (upcoming.length > 0) {
        upcoming.forEach(p => {
            const li = document.createElement('li');
            const bday = new Date(p.birthday + 'T00:00:00');
            li.textContent = `${p.name} on ${bday.toLocaleDateString(undefined, {month: 'long', day: 'numeric'})}`;
            upcomingBirthdaysList.appendChild(li);
        });
    } else {
        upcomingBirthdaysList.innerHTML = '<li>No upcoming birthdays in the next 30 days.</li>';
    }
}

async function generateReports() {
    // ... Function content remains the same
}

async function generateYearlyReports() {
    // ... Function content remains the same
}

// --- SALARY CALCULATOR LOGIC ---
function setupSalaryCalculator() {
    // ... Function content remains the same
}

function calculateNetIncome() {
    // ... Function content remains the same
}
// --- ITEMIZATION MODAL LOGIC ---
function setupItemizationModal() {
    // ... Function content remains the same
}

async function openItemizationModal(expenseId) {
    // ... Function content remains the same
}

async function renderItemizedList(expense, expenseId) {
    // ... Function content remains the same
}

async function deleteItemizedEntry(expenseId, itemIndex) {
    // ... Function content remains the same
}
