/**
 * ==========================================================================
 * firebase.js - محرك الاتصال بـ Firebase، الترحيل السحابي التلقائي، والمزامنة الحية
 * دار المُهتدية النسائية — جامع الهدى
 * ==========================================================================
 */

let dbFirestore = null;
let firebaseAuth = null;
let isFirebaseOnline = false;
let isSyncInitialized = false;

// الإعدادات الافتراضية
const SAFE_DEFAULT_SETTINGS = window.DEFAULT_SETTINGS || {
  orgName: "دار المُهتدية النسائية",
  subTitle: "جامع الهدى",
  directorName: "المديرة",
  logoNew: "logo12.jpeg",
  logoOld: "",
  logoLogin: "logo111.png",
  headerFontSize: "13px",
  location: "",
};

const SAFE_ROLES = window.ROLES || {
  ADMIN: "admin",
  TEACHER: "teacher",
  STUDENT: "student",
  SCREEN: "screen",
};

const STORAGE_KEY =
  typeof LOCAL_STORAGE_KEY !== "undefined"
    ? LOCAL_STORAGE_KEY
    : window.LOCAL_STORAGE_KEY || "HALAQAT_MUHTADIA_WOMEN_DB_V1";

// كائن تخزين البيانات العام المحمي
window.appStore = window.appStore || {
  users: [],
  students: [],
  teachers: [],
  circles: [],
  attendance: [],
  teacherAttendance: [],
  tasmeea: [],
  tests: [],
  notifications: [],
  messages: [],
  screenOrder: [],
  circlesOrder: [],
  trophyStudentId: null,
  settings: { ...SAFE_DEFAULT_SETTINGS },
  logs: [],
};

// تهيئة Firebase والاتصال بـ Firestore
function initFirebaseApp() {
  try {
    const config =
      typeof FIREBASE_CONFIG !== "undefined"
        ? FIREBASE_CONFIG
        : window.FIREBASE_CONFIG;

    if (typeof firebase !== "undefined" && config) {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      dbFirestore = firebase.firestore();
      firebaseAuth = firebase.auth();
      isFirebaseOnline = true;
      console.log("✅ تم الاتصال بقاعدة بيانات دار المُهتدية النسائية بنجاح");
    } else {
      console.warn("⚠️ مكتبات Firebase غير محملة. تم استخدام التخزين المحلي.");
      isFirebaseOnline = false;
    }
  } catch (error) {
    console.warn(
      "⚠️ حدث خطأ في الاتصال بـ Firebase، سيتم العمل بالوضع المحلي:",
      error,
    );
    isFirebaseOnline = false;
  }

  loadInitialData();
}

// تحميل البيانات وربط المزامنة الفورية وترحيل البيانات للسحابة مرة واحدة فقط
function loadInitialData() {
  const localData = localStorage.getItem(STORAGE_KEY);
  if (localData) {
    try {
      const parsedData = JSON.parse(localData);
      window.appStore = Object.assign(window.appStore, parsedData);
    } catch (e) {
      console.error("خطأ في قراءة LocalStorage:", e);
      seedProductionAdminOnly();
    }
  } else {
    seedProductionAdminOnly();
  }

  // ضمان سلامة المصفوفات
  ensureArraysIntegrity();
  ensureDefaultAccounts();
  migrateAllPasswordsRoleBased();
  saveLocalStore();

  // تفعيل المزامنة اللحظية الخفيفة
  if (isFirebaseOnline && dbFirestore) {
    setupRealtimeCloudSync();
    
    // ترحيل البيانات إلى السحابة مرة واحدة فقط إذا لم يسبق ترحيلها
    const migrationDoneKey = "HALAQAT_MIGRATION_COMPLETED_V1";
    if (!localStorage.getItem(migrationDoneKey)) {
      autoMigrateLocalDataToCloud().then(() => {
        localStorage.setItem(migrationDoneKey, "true");
      });
    }
  }
}

function ensureArraysIntegrity() {
  const keys = [
    "users",
    "students",
    "teachers",
    "circles",
    "attendance",
    "teacherAttendance",
    "tasmeea",
    "tests",
    "notifications",
    "messages",
    "screenOrder",
    "logs",
  ];
  keys.forEach((k) => {
    if (!Array.isArray(window.appStore[k])) window.appStore[k] = [];
  });
}

// إنشاء الحسابات الافتراضية
function ensureDefaultAccounts() {
  let adminUser = window.appStore.users.find(
    (u) =>
      (u.username === "123456" || u.username === "admin") &&
      u.role === SAFE_ROLES.ADMIN,
  );

  if (!adminUser) {
    window.appStore.users.push({
      id: "u_admin_main",
      name: "المديرة",
      role: SAFE_ROLES.ADMIN,
      username: "123456",
      pass: "1234",
      phone: "0500000000",
      status: "active",
      createdAt: Date.now(),
    });
  } else {
    adminUser.name = "المديرة";
  }

  const hasScreen = window.appStore.users.some(
    (u) => u.username === "121212" && u.role === SAFE_ROLES.SCREEN,
  );

  if (!hasScreen) {
    window.appStore.users.push({
      id: "u_screen_fixed",
      name: "نجمات التميز",
      role: SAFE_ROLES.SCREEN,
      username: "121212",
      pass: "1234",
      phone: "0500000000",
      status: "active",
      createdAt: Date.now(),
    });
  }
}

// دالة توحيد الرقم السري محلياً دون إغراق السحابة بعمليات كتابة
function migrateAllPasswordsRoleBased() {
  if (Array.isArray(window.appStore.users)) {
    window.appStore.users.forEach((user) => {
      if (user.role === SAFE_ROLES.STUDENT || user.role === "student") {
        if (user.pass !== "1111") user.pass = "1111";
      } else if (user.role === SAFE_ROLES.TEACHER || user.role === "teacher") {
        if (!user.pass || user.pass === "") user.pass = "1234";
      }
    });
  }

  if (Array.isArray(window.appStore.students)) {
    window.appStore.students.forEach((stu) => {
      let userRec = (window.appStore.users || []).find((u) => u.id === stu.id);
      if (!userRec) {
        userRec = {
          id: stu.id,
          name: stu.name,
          phone: stu.phone || stu.parentPhone,
          role: "student",
          username: stu.nationalId || stu.phone || stu.id,
          pass: "1111",
          status: stu.status || "active",
          createdAt: stu.createdAt || Date.now(),
        };
        window.appStore.users.push(userRec);
      }
    });
  }
}

// حفظ الحالة في التخزين المحلي
function saveLocalStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(window.appStore));
  } catch (e) {
    console.error("فشل حفظ البيانات في LocalStorage:", e);
  }
}

// تهيئة البيانات النظيفة
function seedProductionAdminOnly() {
  const baseTime = Date.now();
  window.appStore = {
    users: [
      {
        id: "u_admin_main",
        name: "المديرة",
        role: SAFE_ROLES.ADMIN,
        username: "123456",
        pass: "1234",
        phone: "0500000000",
        status: "active",
        createdAt: baseTime,
      },
      {
        id: "u_screen_fixed",
        name: "نجمات التميز",
        role: SAFE_ROLES.SCREEN,
        username: "121212",
        pass: "1234",
        phone: "0500000000",
        status: "active",
        createdAt: baseTime,
      },
    ],
    teachers: [],
    circles: [],
    students: [],
    attendance: [],
    teacherAttendance: [],
    tasmeea: [],
    tests: [],
    notifications: [],
    messages: [],
    screenOrder: [],
    circlesOrder: [],
    trophyStudentId: null,
    settings: { ...SAFE_DEFAULT_SETTINGS },
    logs: [
      {
        id: "log_" + baseTime,
        userName: "المديرة",
        action: "تهيئة النظام وتدشين الحسابات لدار المُهتدية النسائية",
        timestamp: new Date().toLocaleDateString("ar-SA"),
      },
    ],
  };
  saveLocalStore();
}

// ترحيل البيانات إلى السحابة بحزم مجمعة (Batch) لتقليل عمليات الكتابة
window.autoMigrateLocalDataToCloud = async function () {
  if (!dbFirestore) return;

  const collectionsToSync = [
    "users",
    "students",
    "teachers",
    "circles",
    "attendance",
    "teacherAttendance",
    "tasmeea",
    "tests",
    "notifications",
  ];

  try {
    for (const colName of collectionsToSync) {
      const localItems = window.appStore[colName] || [];
      if (localItems.length > 0) {
        // استخدام Batch للكتابة الجماعية لتوفير الحصة
        const batch = dbFirestore.batch();
        let count = 0;

        for (const item of localItems) {
          if (item && item.id) {
            const docRef = dbFirestore.collection(colName).doc(String(item.id));
            batch.set(docRef, item, { merge: true });
            count++;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      }
    }

    if (window.appStore.settings) {
      await dbFirestore
        .collection("settings")
        .doc("main_settings")
        .set(window.appStore.settings, { merge: true });
    }

    console.log("☁️ تم رفع البيانات إلى السحابة بنجاح دون استهلاك إضافي.");
  } catch (err) {
    console.error("خطأ أثناء ترحيل البيانات السحابية:", err);
  }
};

// المزامنة اللحظية الذكية بدون تكرار الحلقات
function setupRealtimeCloudSync() {
  if (!dbFirestore || isSyncInitialized) return;
  isSyncInitialized = true;

  const allCollections = [
    "users",
    "students",
    "teachers",
    "circles",
    "attendance",
    "teacherAttendance",
    "tasmeea",
    "tests",
    "notifications",
    "messages",
    "screenOrder",
    "settings",
    "logs",
  ];

  allCollections.forEach((colName) => {
    try {
      dbFirestore.collection(colName).onSnapshot(
        (snapshot) => {
          // تجاهل الإشعار إذا كان التعديل قد صدر محلياً للتو لتفادي تكرار القراءة
          if (snapshot.metadata.hasPendingWrites) return;

          if (!snapshot.empty) {
            const items = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));

            if (colName === "settings") {
              window.appStore.settings = items[0] || SAFE_DEFAULT_SETTINGS;
              if (typeof applyAppIdentity === "function") applyAppIdentity();
            } else if (colName === "screenOrder") {
              window.appStore.screenOrder = items[0]?.order || [];
            } else {
              window.appStore[colName] = items;
            }

            saveLocalStore();

            // تحديث الواجهة فقط إذا كان المستخدم مسجلاً للدخول بالفعل
            if (window.currentUser && typeof refreshActiveView === "function") {
              const activeView = document.querySelector(".content-view.active")?.id;
              if (activeView) refreshActiveView(activeView);
            }
          }
        },
        (error) => {
          console.warn(`تنبيه أثناء الاستماع لمجموعة (${colName}):`, error);
        },
      );
    } catch (err) {
      console.warn(`خطأ في ربط المزامنة لـ ${colName}:`, err);
    }
  });
}

// دالة تنفيذ التصفير اليدوي الآمن عند طلب الإدارة فقط
window.executeSafeOperationalReset = async function () {
  const confirmAction = confirm(
    "هل أنتِ متأكدة من تصفير سجلات التحضير والتسميع والاختبارات والإشعارات السابقة؟\n(الطالبات والمعلمات والحلقات لن تتأثر نهائياً).",
  );
  if (!confirmAction) return;

  const collectionsToPurge = [
    "attendance",
    "teacherAttendance",
    "tasmeea",
    "tests",
    "notifications",
    "messages",
    "screenOrder",
  ];

  collectionsToPurge.forEach((key) => {
    window.appStore[key] = [];
  });

  saveLocalStore();

  if (isFirebaseOnline && dbFirestore) {
    for (const colName of collectionsToPurge) {
      try {
        const snapshot = await dbFirestore.collection(colName).get();
        if (!snapshot.empty) {
          const batch = dbFirestore.batch();
          snapshot.docs.forEach((d) => {
            batch.delete(d.ref);
          });
          await batch.commit();
        }
      } catch (e) {
        console.error(`خطأ أثناء تصفير ${colName}:`, e);
      }
    }
  }

  alert(
    "✅ تم تصفير كافة السجلات التشغيلية السابقة بنجاح وبدء دورة جديدة نظيفة!",
  );
  if (typeof refreshAllViews === "function") refreshAllViews();
};

// حفظ أو حذف مستند في السحابة بأمان فوري مع إظهار تنبيه في حال حدوث خطأ
async function saveToCloud(collectionName, docId, data, isDelete = false) {
  saveLocalStore();
  if (isFirebaseOnline && dbFirestore) {
    try {
      if (isDelete) {
        await dbFirestore.collection(collectionName).doc(String(docId)).delete();
      } else {
        await dbFirestore
          .collection(collectionName)
          .doc(String(docId))
          .set(data, { merge: true });
      }
    } catch (e) {
      console.error(`❌ فشل الحفظ في السحابة [${collectionName}]:`, e);
      alert(
        `⚠️ تعذر رفع التعديل إلى قاعدة البيانات السحابية!\nالخطأ: ${e.message}`,
      );
    }
  }
}

// تسجيل عملية جديدة في سجل العمليات Logs
function addSystemLog(actionDesc) {
  const currentUser = window.currentUser || { name: "النظام" };
  const now = new Date();
  const timeString = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;

  const newLog = {
    id: "log_" + Date.now(),
    userName: currentUser.name,
    action: actionDesc,
    timestamp: timeString,
    createdAt: Date.now(),
  };

  if (!Array.isArray(window.appStore.logs)) window.appStore.logs = [];
  window.appStore.logs.unshift(newLog);
  if (window.appStore.logs.length > 200) {
    window.appStore.logs.pop();
  }

  saveToCloud("logs", newLog.id, newLog);
}

// تشغيل الفايربيز عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
  initFirebaseApp();
});
