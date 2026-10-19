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

// تحصين ضد حقن HTML/جافاسكريبت (XSS): يُستخدم عند إدراج أي نص مصدره المستخدم
// (اسم، ملاحظة، رقم جوال...) داخل innerHTML، خصوصاً النصوص القادمة من نماذج
// عامة لا تتطلب تسجيل دخول (مثل استمارة طلب الالتحاق) حيث يمكن لأي زائر كتابة
// أي نص فيها - بدون هذا التحصين قد يُنفَّذ كودٌ ضار داخل متصفح المديرة نفسها
window.escapeHtml = function (value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

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
  trophyStudentIds: [],
  settings: { ...SAFE_DEFAULT_SETTINGS },
  logs: [],
  teacherLogs: [],
  financeRevenues: [],
  financeExpenses: [],
  payroll: [],
};

// تهيئة Firebase والاتصال بـ Firestore
async function initFirebaseApp() {
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

      // تفعيل التخزين المحلي الدائم (Persistence): يقلل قراءات Firestore
      // بشكل كبير عند إعادة فتح نفس الجهاز/المتصفح، لأن البيانات تُقرأ
      // من ذاكرة الجهاز أولاً بدل طلبها من الخادم في كل مرة. يجب استدعاؤها
      // هنا قبل أي عملية Firestore أخرى. آمنة تماماً: لو فشل التفعيل لأي
      // سبب (متصفح قديم، وضع تصفح خفي، إلخ) يستمر التطبيق بعمله الطبيعي
      // عبر الشبكة كالمعتاد دون أي كسر أو تأثير على أي ميزة.
      try {
        await dbFirestore.enablePersistence({ synchronizeTabs: true });
        console.log("✅ تم تفعيل التخزين المحلي الدائم بنجاح.");
      } catch (persistErr) {
        console.warn(
          "⚠️ تعذر تفعيل التخزين المحلي الدائم (سيعمل التطبيق بشكل طبيعي عبر الشبكة):",
          persistErr && persistErr.code ? persistErr.code : persistErr,
        );
      }
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
  if (!localData) {
    wClearSyncState();
    try {
      localStorage.removeItem("HALAQAT_W_ONDEMAND_CURSORS_V1");
    } catch (e) {}
  }
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
    watchForAppUpdates();

    // ترحيل البيانات إلى السحابة مرة واحدة فقط إذا لم يسبق ترحيلها.
    // يتم التحقق محلياً أولاً (سريع، بدون قراءة)، ثم مركزياً من Firestore
    // نفسه، حتى لا يُعاد الترحيل الكامل من أي جهاز/متصفح جديد يفتح
    // التطبيق لأول مرة (وهو ما كان يسبب طفرات كبيرة في عمليات الكتابة).
    const migrationDoneKey = "HALAQAT_MIGRATION_COMPLETED_V1";
    if (!localStorage.getItem(migrationDoneKey)) {
      checkAndRunCloudMigration(migrationDoneKey);
    }
  }
}

// تحقق مركزي (قراءة واحدة فقط) من حالة الترحيل قبل تنفيذه، لمنع تكراره
// من كل جهاز/متصفح جديد. لا يُغيّر أي سلوك آخر في التطبيق.
async function checkAndRunCloudMigration(migrationDoneKey) {
  console.log("🔍 [DIAG] بدء فحص حالة الترحيل مركزياً من Firestore...");
  try {
    const statusDoc = await dbFirestore
      .collection("meta")
      .doc("migrationStatus")
      .get();

    console.log(
      "🔍 [DIAG] نتيجة فحص meta/migrationStatus:",
      statusDoc.exists ? statusDoc.data() : "المستند غير موجود",
    );

    if (statusDoc.exists && statusDoc.data().migrated === true) {
      // تم الترحيل مسبقاً من جهاز آخر، فقط سجّل ذلك محلياً وتجاهل التكرار
      console.log("🔍 [DIAG] الترحيل تم مسبقاً، لن يُعاد تنفيذه.");
      localStorage.setItem(migrationDoneKey, "true");
      return;
    }

    console.warn(
      "🔍 [DIAG] لم يتم الترحيل مسبقاً حسب Firestore — سيبدأ الترحيل الكامل الآن...",
    );
    await autoMigrateLocalDataToCloud();

    await dbFirestore
      .collection("meta")
      .doc("migrationStatus")
      .set({ migrated: true, migratedAt: Date.now() }, { merge: true });

    console.log(
      "🔍 [DIAG] تم تسجيل اكتمال الترحيل مركزياً في meta/migrationStatus.",
    );

    localStorage.setItem(migrationDoneKey, "true");
  } catch (e) {
    console.error(
      "🔍 [DIAG] ⚠️ فشل فحص/تنفيذ الترحيل — الكود:",
      e.code,
      "| الرسالة:",
      e.message,
    );
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
    "teacherLogs",
    "financeRevenues",
    "financeExpenses",
    "payroll",
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
    return true;
  } catch (e) {
    console.error("فشل حفظ البيانات في LocalStorage:", e);
    // النسخة المحلية لم تعد مطابقة للمؤشرات: الفتح القادم يحمّل كل شيء من جديد
    wClearSyncState();
    return false;
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
    trophyStudentIds: [],
    settings: { ...SAFE_DEFAULT_SETTINGS },
    logs: [
      {
        id: "log_" + baseTime,
        userName: "المديرة",
        action: "تهيئة النظام وتدشين الحسابات لدار المُهتدية النسائية",
        timestamp: new Date().toLocaleDateString("ar-SA"),
        createdAt: baseTime,
      },
    ],
    teacherLogs: [],
    financeRevenues: [],
    financeExpenses: [],
    payroll: [],
  };
  saveLocalStore();
}

// ترحيل البيانات إلى السحابة بحزم مجمعة (Batch) لتقليل عمليات الكتابة
window.autoMigrateLocalDataToCloud = async function () {
  if (!dbFirestore) return;
  console.warn(
    "🔍 [DIAG] ⚠️⚠️ autoMigrateLocalDataToCloud بدأت التنفيذ الآن — سيتم كتابة كل البيانات المحلية على السحابة!",
  );
  dbFirestore
    .collection("meta")
    .doc("lastWriteDebug")
    .set(
      {
        collectionName: "(( ترحيل جماعي كامل autoMigrateLocalDataToCloud ))",
        docId: "-",
        isDelete: false,
        userAgent: navigator.userAgent,
        currentUser:
          (window.currentUser && window.currentUser.name) || "غير مسجل دخول",
        at: Date.now(),
        atReadable: new Date().toLocaleString("ar-SA"),
      },
      { merge: true },
    )
    .catch(() => {});

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
    "teacherLogs",
    "financeRevenues",
    "financeExpenses",
    "payroll",
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

// ===== نظام كشف التحديثات التلقائي =====
// عند عمل إصلاح مهم مستقبلاً: غيّري القيمة التالية إلى نص جديد مختلف
// (مثلاً تاريخ اليوم)، ثم بعد النشر حدّثي حقل "latest" في مستند
// meta/appVersion على Firestore ليطابق نفس القيمة. عندها أي جهاز
// يشغّل نسخة قديمة سيكتشف ذلك فوراً (بدون انتظار) ويُعيد تحميل
// الصفحة تلقائياً، فيحصل على آخر إصلاحات الكود دون أي تدخل يدوي.
const APP_BUILD_VERSION = "2026-10-19-1";

function watchForAppUpdates() {
  if (!dbFirestore) return;
  try {
    dbFirestore
      .collection("meta")
      .doc("appVersion")
      .onSnapshot(
        (doc) => {
          if (!doc.exists) return;
          const latest = doc.data().latest;
          // يُعاد التحميل فقط إذا كان المنشور أحدث من هذه النسخة (الصيغة تاريخية فالمقارنة
          // النصية تكفي)، فلا تدخل النسخة الجديدة في إعادة تحميل متكررة قبل تحديث المستند
          if (latest && String(latest) > APP_BUILD_VERSION) {
            console.warn(
              "⚠️ يوجد إصدار أحدث من التطبيق، سيتم تحديث الصفحة تلقائياً...",
            );
            window.location.reload();
          }
        },
        (error) => {
          console.warn("تنبيه أثناء التحقق من إصدار التطبيق:", error);
        },
      );
  } catch (err) {
    console.warn("خطأ في تفعيل التحقق من إصدار التطبيق:", err);
  }
}

// المزامنة اللحظية الذكية بدون تكرار الحلقات
// عدد الأيام التي تُزامن لحظياً لمجموعتي الحضور والتسميع فقط (تكبران
// باستمرار مع الوقت). التاريخ الأقدم يبقى محفوظاً بأمان في Firestore
// ويُجلب عند الطلب فقط عبر ensureFullAttendanceTasmeeaHistory أدناه
// (تستخدمها صفحة التقارير عند الحاجة الفعلية لفترات أقدم).
const RECENT_SYNC_DAYS = 30;

function getRecentSyncCutoffDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().split("T")[0];
}

// المزامنة السابقة كما هي تماماً (استماع لكل المستندات): تُستخدم فقط كاحتياط إذا تعذّرت
// المزامنة بالتغييرات فقط أدناه لأي سبب
function setupLegacyFullListeners() {
  if (!dbFirestore) return;

  // ملاحظة: "logs" غير موجودة هنا عمداً. لا توجد أي شاشة في التطبيق
  // تعرض سجل العمليات (تم التأكد من ذلك في admin.js)، وبالتالي فإن
  // مزامنته اللحظية الكاملة كانت تستهلك قراءات دون أي استخدام فعلي.
  // الكتابة إلى logs عبر addSystemLog تبقى تماماً كما هي، والسجل الكامل
  // يبقى محفوظاً بأمان في Firestore ويمكن مراجعته منه مباشرة كالمعتاد.
  //
  // كذلك "tests" / "teacherLogs" / "financeRevenues" / "financeExpenses" /
  // "payroll" غير موجودة هنا عمداً أيضاً: لا تحتاج مزامنة لحظية دائمة لأنها
  // نادراً ما تتغيّر من مستخدمة أخرى بنفس اللحظة، فتُجلب عند الحاجة الفعلية
  // فقط (عند فتح شاشتها) عبر refreshOnDemandCollections أدناه، بدل إبقاء
  // اتصال مفتوح عليها طوال الجلسة.
  const allCollections = [
    "users",
    "students",
    "teachers",
    "circles",
    "attendance",
    "teacherAttendance",
    "tasmeea",
    "notifications",
    "messages",
    "screenOrder",
    "settings",
  ];

  // مجموعتا الحضور والتسميع فقط تُقيَّدان بنافذة زمنية حديثة، لأنهما
  // الأكبر تراكماً والأكثر استهلاكاً للقراءات مع تراكم الأشهر.
  const dateScopedCollections = ["attendance", "tasmeea"];
  const recentCutoffDate = getRecentSyncCutoffDate(RECENT_SYNC_DAYS);

  allCollections.forEach((colName) => {
    try {
      const colRef = dateScopedCollections.includes(colName)
        ? dbFirestore.collection(colName).where("date", ">=", recentCutoffDate)
        : dbFirestore.collection(colName);

      colRef.onSnapshot(
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
              // ترقية من حقل "الكأس المفرد" القديم إلى قائمة (كأس واحدة لكل حلقة) دون
              // فقدان أي اختيار سابق كانت قد حدّدته المديرة قبل هذا التحديث
              const cloudTrophyIds = items[0]?.trophyStudentIds;
              window.appStore.trophyStudentIds = Array.isArray(cloudTrophyIds)
                ? cloudTrophyIds
                : items[0]?.trophyStudentId
                  ? [items[0].trophyStudentId]
                  : [];
            } else {
              window.appStore[colName] = items;
            }

            saveLocalStore();

            // تحديث الواجهة فقط إذا كان المستخدم مسجلاً للدخول بالفعل
            if (window.currentUser && typeof refreshActiveView === "function") {
              const activeView = document.querySelector(
                ".content-view.active",
              )?.id;
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

// ==========================================================================
// تقليل القراءات: "الاستماع للتغييرات فقط"
// سابقاً: كل فتح للتطبيق (بعد 30 دقيقة من آخر فتح) يقرأ كل مستندات 11 مجموعة من جديد.
// الآن: كل جهاز يحتفظ بنسخته، وبعد أول تحميل كامل يستمع فقط للمستندات التي تغيّرت بعد آخر
// مرة (كل حفظ يضع ختم وقت من الخادم _srvAt)، مع بقاء التحديث الفوري كما هو. والحذف يُسجَّل
// في deletedTombstones حتى يختفي المحذوف من كل الأجهزة.
// تحميل كامل تلقائي: أول مرة على الجهاز، أو بعد مسح بياناته، أو مرة كل 7 أيام، أو بزر المديرة.
// إن تعذّر أي شيء يرجع التطبيق تلقائياً لطريقة المزامنة السابقة كما كانت تماماً.
// ==========================================================================
const W_SERVER_STAMP_FIELD = "_srvAt";
const W_SYNC_STATE_KEY = "HALAQAT_W_SYNC_STATE_V1";
const W_FULL_SYNC_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
const W_LIVE_OVERLAP_MS = 60 * 1000;
const W_LIVE_RESTART_MS = 2 * 60 * 60 * 1000;
const W_LIVE_COLLECTIONS = [
  "users",
  "students",
  "teachers",
  "circles",
  "attendance",
  "teacherAttendance",
  "tasmeea",
  "notifications",
  "messages",
  "screenOrder",
  "settings",
];
const W_DATE_SCOPED = ["attendance", "tasmeea"];
const W_SPECIAL = ["settings", "screenOrder"];

let wLiveUnsubs = [];
let wLiveState = null;
let wLiveRestartTimer = null;
let wPersistTimer = null;
let wRefreshTimer = null;
const wSpecialTimers = {};

function wReadSyncState() {
  try {
    const s = JSON.parse(localStorage.getItem(W_SYNC_STATE_KEY) || "null");
    return s && s.v === 1 && s.cursors ? s : null;
  } catch (e) {
    return null;
  }
}
function wWriteSyncState(s) {
  try {
    localStorage.setItem(W_SYNC_STATE_KEY, JSON.stringify(s));
  } catch (e) {
    wClearSyncState();
  }
}
function wClearSyncState() {
  try {
    localStorage.removeItem(W_SYNC_STATE_KEY);
    localStorage.removeItem("HALAQAT_W_ONDEMAND_CURSORS_V1");
  } catch (e) {}
}
window.clearWomenSyncState = wClearSyncState;

function wStampMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number")
    return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  return 0;
}

function wDocToItem(doc) {
  const data = doc.data() || {};
  delete data[W_SERVER_STAMP_FIELD];
  return { id: doc.id, ...data };
}

function wIsStateUsable(state) {
  if (!state || !state.lastFullAt || !state.cursors) return false;
  const now = Date.now();
  if (now - state.lastFullAt > W_FULL_SYNC_EVERY_MS) return false;
  if (now < state.lastFullAt - 24 * 60 * 60 * 1000) return false;
  if (typeof state.cursors.deletedTombstones !== "number") return false;
  return W_LIVE_COLLECTIONS.every((c) => typeof state.cursors[c] === "number");
}

// بداية الفترة المحفوظة محلياً للحضور والتسميع (نفس نافذة الـ 30 يوماً السابقة)
function wRecentCutoff() {
  return getRecentSyncCutoffDate(RECENT_SYNC_DAYS);
}

function wApplySpecial(colName, items) {
  if (colName === "settings") {
    window.appStore.settings = items[0] || SAFE_DEFAULT_SETTINGS;
    if (typeof applyAppIdentity === "function") applyAppIdentity();
  } else if (colName === "screenOrder") {
    window.appStore.screenOrder = items[0]?.order || [];
    const cloudTrophyIds = items[0]?.trophyStudentIds;
    window.appStore.trophyStudentIds = Array.isArray(cloudTrophyIds)
      ? cloudTrophyIds
      : items[0]?.trophyStudentId
        ? [items[0].trophyStudentId]
        : [];
  }
}

// الحضور والتسميع يبقيان محلياً بنافذة آخر 30 يوماً كما كانا (لا تكبر ذاكرة الجهاز)
// أقدم تاريخ جُلب كاملاً للتقارير في هذه الجلسة ("ALL" = كل التاريخ): يبقى محفوظاً ومحدَّثاً
// بالتغييرات فلا تُعاد قراءته مع كل تقرير
let wHistoryFrom = null;

function wPruneDateScoped() {
  let cutoff = wRecentCutoff();
  if (wHistoryFrom === "ALL") return;
  if (wHistoryFrom && wHistoryFrom < cutoff) cutoff = wHistoryFrom;
  W_DATE_SCOPED.forEach((col) => {
    if (Array.isArray(window.appStore[col])) {
      window.appStore[col] = window.appStore[col].filter(
        (it) => !it || !it.date || it.date >= cutoff,
      );
    }
  });
}

function wRefreshActiveViewSoon() {
  clearTimeout(wRefreshTimer);
  wRefreshTimer = setTimeout(() => {
    if (window.currentUser && typeof refreshActiveView === "function") {
      const activeView = document.querySelector(".content-view.active")?.id;
      if (activeView) refreshActiveView(activeView);
    }
  }, 400);
}

// تحميل كامل مرة واحدة (نفس ما كانت تقرؤه المزامنة السابقة)، مع حساب المؤشرات
async function wRunFullLoad() {
  const recentCutoffDate = wRecentCutoff();
  const cursors = {};
  for (const colName of W_LIVE_COLLECTIONS) {
    const ref = W_DATE_SCOPED.includes(colName)
      ? dbFirestore.collection(colName).where("date", ">=", recentCutoffDate)
      : dbFirestore.collection(colName);
    const snapshot = await ref.get();
    let maxStamp = 0;
    snapshot.docs.forEach((d) => {
      const s = wStampMillis((d.data() || {})[W_SERVER_STAMP_FIELD]);
      if (s > maxStamp) maxStamp = s;
    });
    cursors[colName] = maxStamp;
    if (!snapshot.empty) {
      const items = snapshot.docs.map(wDocToItem);
      if (W_SPECIAL.includes(colName)) wApplySpecial(colName, items);
      else window.appStore[colName] = items;
    }
  }
  const tombSnap = await dbFirestore.collection("deletedTombstones").get();
  let tombMax = 0;
  tombSnap.docs.forEach((d) => {
    const s = wStampMillis((d.data() || {})[W_SERVER_STAMP_FIELD]);
    if (s > tombMax) tombMax = s;
  });
  cursors.deletedTombstones = tombMax;
  const savedLocally = saveLocalStore();
  const state = {
    v: 1,
    lastFullAt: Date.now(),
    recentFrom: recentCutoffDate,
    cursors,
  };
  if (savedLocally) wWriteSyncState(state);
  wRefreshActiveViewSoon();
  return state;
}

function wPersistStateSoon() {
  clearTimeout(wPersistTimer);
  wPersistTimer = setTimeout(() => {
    if (!wLiveState) return;
    if (saveLocalStore()) wWriteSyncState(wLiveState);
  }, 2000);
}

function wHandleChanges(colName, docs) {
  if (!wLiveState || docs.length === 0) return;
  let cursor = wLiveState.cursors[colName] || 0;
  docs.forEach((d) => {
    const s = wStampMillis((d.data() || {})[W_SERVER_STAMP_FIELD]);
    if (s > cursor) cursor = s;
  });
  wLiveState.cursors[colName] = cursor;

  if (colName === "deletedTombstones") {
    docs.forEach((d) => {
      const t = d.data() || {};
      if (!t.collection || !t.docId) return;
      if (Array.isArray(window.appStore[t.collection])) {
        window.appStore[t.collection] = window.appStore[t.collection].filter(
          (it) => !(it && String(it.id) === String(t.docId)),
        );
      }
    });
  } else if (W_SPECIAL.includes(colName)) {
    // مستند أو مستندان فقط: يُعاد قراءتهما كاملين بنفس منطق المزامنة السابقة
    clearTimeout(wSpecialTimers[colName]);
    wSpecialTimers[colName] = setTimeout(async () => {
      try {
        const snap = await dbFirestore.collection(colName).get();
        if (!snap.empty) {
          wApplySpecial(colName, snap.docs.map(wDocToItem));
          saveLocalStore();
          wRefreshActiveViewSoon();
        }
      } catch (e) {
        console.warn(`تعذر تحديث (${colName}):`, e);
      }
    }, 1000);
    wPersistStateSoon();
    return;
  } else {
    if (!Array.isArray(window.appStore[colName])) window.appStore[colName] = [];
    const arr = window.appStore[colName];
    docs.forEach((d) => {
      const item = wDocToItem(d);
      const idx = arr.findIndex((it) => it && String(it.id) === String(item.id));
      if (idx > -1) arr[idx] = item;
      else arr.push(item);
    });
    if (W_DATE_SCOPED.includes(colName)) wPruneDateScoped();
  }
  wPersistStateSoon();
  wRefreshActiveViewSoon();
}

function wStopLiveListeners() {
  wLiveUnsubs.forEach((u) => {
    try {
      u();
    } catch (e) {}
  });
  wLiveUnsubs = [];
  clearTimeout(wLiveRestartTimer);
}

function wAttachLiveListeners(state) {
  wStopLiveListeners();
  wLiveState = state;
  [...W_LIVE_COLLECTIONS, "deletedTombstones"].forEach((colName) => {
    const from = firebase.firestore.Timestamp.fromMillis(
      Math.max(0, (state.cursors[colName] || 0) - W_LIVE_OVERLAP_MS),
    );
    const unsub = dbFirestore
      .collection(colName)
      .where(W_SERVER_STAMP_FIELD, ">", from)
      .onSnapshot(
        (snapshot) => {
          if (snapshot.metadata.hasPendingWrites) return;
          const docs = snapshot
            .docChanges()
            .filter((ch) => ch.type !== "removed")
            .map((ch) => ch.doc);
          wHandleChanges(colName, docs);
        },
        (error) => {
          console.warn(`تنبيه أثناء الاستماع لتغييرات (${colName}):`, error);
        },
      );
    wLiveUnsubs.push(unsub);
  });

  // كل ساعتين: إعادة تهيئة بمؤشرات محدَّثة، وتحميل كامل إن حان موعده الأسبوعي
  wLiveRestartTimer = setTimeout(async () => {
    if (saveLocalStore()) wWriteSyncState(wLiveState);
    await wStartCloudSync(false);
  }, W_LIVE_RESTART_MS);
}

async function wStartCloudSync(forceFull) {
  let state = wReadSyncState();
  try {
    if (forceFull || !wIsStateUsable(state)) {
      wStopLiveListeners();
      state = await wRunFullLoad();
    }
    wAttachLiveListeners(state);
    return true;
  } catch (e) {
    console.warn(
      "تعذّر تشغيل المزامنة بالتغييرات فقط، سيتم استخدام المزامنة السابقة:",
      e,
    );
    wStopLiveListeners();
    wLiveState = null;
    setupLegacyFullListeners();
    return false;
  }
}

function setupRealtimeCloudSync() {
  if (!dbFirestore || isSyncInitialized) return;
  isSyncInitialized = true;
  wStartCloudSync(false);
}

// زر المديرة: تحميل كامل الآن (مثل أول تشغيل على الجهاز)
window.runManualFullSync = async function () {
  const user = window.currentUser;
  if (!user || user.role !== SAFE_ROLES.ADMIN || !dbFirestore) return;
  if (
    !confirm(
      "سيتم تحميل كل البيانات من قاعدة البيانات الآن (مثل أول تشغيل على الجهاز).\nاستخدميها فقط إذا لاحظتِ أن بيانات لا تظهر على هذا الجهاز.\n\nمتابعة؟",
    )
  )
    return;
  const status = document.getElementById("manual-sync-status");
  if (status) status.textContent = "جاري المزامنة الكاملة...";
  const ok = await wStartCloudSync(true);
  if (status)
    status.textContent = ok
      ? "✅ تمت المزامنة الكاملة"
      : "⚠️ تعذّرت، تم الرجوع للمزامنة السابقة";
};

// جلب كامل تاريخ الحضور والتسميع عند الحاجة الفعلية فقط (مثلاً صفحة
// التقارير عند طلب فترة أقدم من النافذة اللحظية المحدودة أعلاه).
// هذه قراءة واحدة (get) وليست استماعاً دائماً، فلا تتكرر تلقائياً،
// وتُستبدل بها بيانات appStore مؤقتاً بالنسخة الكاملة لهذه الجلسة فقط.
// sinceDate اختياري (YYYY-MM-DD): إن مُرِّر، تُجلب السجلات من هذا التاريخ فقط
// بدل كامل التاريخ منذ إنشاء الدار - يقلل القراءات كثيراً مع تراكم السنوات،
// طالما التقرير المطلوب فعلياً لا يحتاج تاريخاً أقدم منه. بدون تمرير القيمة
// يبقى السلوك القديم (جلب كل شيء) كما هو تماماً لضمان عدم كسر أي استدعاء آخر.
window.ensureFullAttendanceTasmeeaHistory = async function (sinceDate) {
  if (!dbFirestore) return;
  // الفترة المطلوبة موجودة كاملة على الجهاز (آخر 30 يوماً ومحدَّثة بالتغييرات أولاً بأول):
  // لا حاجة لأي قراءة من قاعدة البيانات
  if (sinceDate && wLiveState && wLiveUnsubs.length > 0) {
    const completeFrom =
      wLiveState.recentFrom && wLiveState.recentFrom > wRecentCutoff()
        ? wLiveState.recentFrom
        : wRecentCutoff();
    if (sinceDate >= completeFrom) return;
    // فترة أقدم جُلبت سابقاً في هذه الجلسة وتُحدَّث بالتغييرات أولاً بأول
    if (wHistoryFrom && (wHistoryFrom === "ALL" || sinceDate >= wHistoryFrom))
      return;
  }
  if (!sinceDate && wHistoryFrom === "ALL" && wLiveUnsubs.length > 0) return;
  try {
    const attCol = dbFirestore.collection("attendance");
    const tasmCol = dbFirestore.collection("tasmeea");
    const attQuery = sinceDate
      ? attCol.where("date", ">=", sinceDate)
      : attCol;
    const tasmQuery = sinceDate
      ? tasmCol.where("date", ">=", sinceDate)
      : tasmCol;
    const [attSnap, tasmSnap] = await Promise.all([
      attQuery.get(),
      tasmQuery.get(),
    ]);
    window.appStore.attendance = attSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    window.appStore.tasmeea = tasmSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    if (wLiveUnsubs.length > 0) {
      if (!sinceDate) wHistoryFrom = "ALL";
      else if (wHistoryFrom !== "ALL" && (!wHistoryFrom || sinceDate < wHistoryFrom))
        wHistoryFrom = sinceDate;
    }
    saveLocalStore();
  } catch (e) {
    console.warn("تعذر جلب التاريخ الكامل لأغراض التقارير:", e);
  }
};

// المجموعات التي لا تُزامَن لحظياً بشكل دائم (راجع setupRealtimeCloudSync)
// وتُجلب فقط عند فتح شاشتها الفعلية، مع الدالة التي تُعيد رسم كل شاشة بعد الجلب
const ON_DEMAND_COLLECTIONS = {
  "view-tests": ["tests"],
  "view-finance": ["financeRevenues", "financeExpenses", "payroll"],
};
const ON_DEMAND_RENDER = {
  "view-tests": () => {
    if (typeof renderTestsTable === "function") renderTestsTable();
  },
  "view-finance": () => {
    if (typeof renderFinanceReports === "function") renderFinanceReports();
  },
};
// آخر جلب لكل شاشة: إعادة رسم الشاشة بسبب تعديل وصل لا تُعيد قراءة المجموعة كاملة كل مرة
const ON_DEMAND_LAST_FETCH = {};
const ON_DEMAND_CURSORS_KEY = "HALAQAT_W_ONDEMAND_CURSORS_V1";
const ON_DEMAND_FULL_EVERY_MS = 24 * 60 * 60 * 1000;
const ON_DEMAND_MIN_INTERVAL_MS = 2 * 60 * 1000;

// تجلب مجموعات (tests/teacherLogs/finance...) عند فتح شاشتها فقط بدل إبقائها
// مُزامَنة لحظياً طوال الجلسة - قراءة واحدة (get) عند كل زيارة للشاشة، وليست
// استماعاً دائماً. تُستدعى من refreshActiveView في app.js دون أن تحجب عرض
// البيانات الموجودة أصلاً (تُعيد الرسم فقط بعد اكتمال الجلب).
window.refreshOnDemandCollections = async function (viewId) {
  const names = ON_DEMAND_COLLECTIONS[viewId];
  if (!dbFirestore || !names) return;
  if (Date.now() - (ON_DEMAND_LAST_FETCH[viewId] || 0) < ON_DEMAND_MIN_INTERVAL_MS)
    return;
  ON_DEMAND_LAST_FETCH[viewId] = Date.now();
  try {
    // أول فتح (أو مرة يومياً): قراءة كاملة كما كانت. بعدها: المستندات المتغيّرة فقط منذ آخر
    // مرة (والمحذوف يُزال تلقائياً عبر سجل الحذف في المزامنة)
    let cursors = {};
    try {
      cursors = JSON.parse(localStorage.getItem(ON_DEMAND_CURSORS_KEY) || "{}") || {};
    } catch (e) {}
    const canUseDelta = wLiveUnsubs.length > 0;
    const results = await Promise.all(
      names.map(async (name) => {
        const c = cursors[name];
        const full =
          !canUseDelta ||
          !c ||
          Date.now() - (c.fullAt || 0) > ON_DEMAND_FULL_EVERY_MS;
        const ref = dbFirestore.collection(name);
        const snap = full
          ? await ref.get()
          : await ref
              .where(
                W_SERVER_STAMP_FIELD,
                ">",
                firebase.firestore.Timestamp.fromMillis(
                  Math.max(0, (c.srv || 0) - W_LIVE_OVERLAP_MS),
                ),
              )
              .get();
        return { name, snap, full, prev: c };
      }),
    );
    results.forEach(({ name, snap, full, prev }) => {
      let maxSrv = full ? 0 : (prev && prev.srv) || 0;
      const items = snap.docs.map((doc) => {
        const s2 = wStampMillis((doc.data() || {})[W_SERVER_STAMP_FIELD]);
        if (s2 > maxSrv) maxSrv = s2;
        return wDocToItem(doc);
      });
      if (full) {
        window.appStore[name] = items;
        cursors[name] = { srv: maxSrv, fullAt: Date.now() };
      } else {
        if (!Array.isArray(window.appStore[name])) window.appStore[name] = [];
        const arr = window.appStore[name];
        items.forEach((item) => {
          const idx = arr.findIndex((it) => it && String(it.id) === String(item.id));
          if (idx > -1) arr[idx] = item;
          else arr.push(item);
        });
        cursors[name] = { srv: maxSrv, fullAt: prev.fullAt };
      }
    });
    if (saveLocalStore()) {
      try {
        localStorage.setItem(ON_DEMAND_CURSORS_KEY, JSON.stringify(cursors));
      } catch (e) {}
    } else {
      try {
        localStorage.removeItem(ON_DEMAND_CURSORS_KEY);
      } catch (e) {}
    }
    const rerender = ON_DEMAND_RENDER[viewId];
    if (rerender) rerender();
  } catch (e) {
    console.warn(`تعذر تحديث بيانات (${viewId}) عند الطلب:`, e);
  }
};

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
  console.log(
    `🔍 [DIAG] ${new Date().toLocaleTimeString("ar-SA")} — ${isDelete ? "حذف" : "كتابة"} في [${collectionName}] docId=${docId}`,
  );
  saveLocalStore();

  // ===== تشخيص مؤقت: تسجيل "بصمة" آخر جهاز/متصفح قام بالكتابة =====
  // يُحذف هذا الجزء لاحقاً بعد إيجاد سبب الكتابة المستمرة. يتيح لك
  // معرفة مصدر أي عملية كتابة مباشرة من Firebase Console (مستند
  // meta/lastWriteDebug) دون الحاجة لفحص كل جهاز يدوياً.
  if (isFirebaseOnline && dbFirestore) {
    dbFirestore
      .collection("meta")
      .doc("lastWriteDebug")
      .set(
        {
          collectionName,
          docId: String(docId),
          isDelete: !!isDelete,
          userAgent: navigator.userAgent,
          currentUser:
            (window.currentUser && window.currentUser.name) || "غير مسجل دخول",
          at: Date.now(),
          atReadable: new Date().toLocaleString("ar-SA"),
        },
        { merge: true },
      )
      .catch(() => {});
  }

  if (isFirebaseOnline && dbFirestore) {
    try {
      const serverStamp =
        firebase.firestore.FieldValue &&
        firebase.firestore.FieldValue.serverTimestamp();
      if (isDelete) {
        await dbFirestore
          .collection(collectionName)
          .doc(String(docId))
          .delete();
        // سجل الحذف: حتى يختفي المحذوف من كل الأجهزة (المزامنة بالتغييرات فقط)
        if (collectionName !== "deletedTombstones" && serverStamp) {
          await dbFirestore
            .collection("deletedTombstones")
            .doc(`${collectionName}__${String(docId)}`)
            .set({
              collection: collectionName,
              docId: String(docId),
              deletedAt: Date.now(),
              [W_SERVER_STAMP_FIELD]: serverStamp,
            });
        }
      } else {
        // ختم وقت من الخادم (نسخة من البيانات حتى لا يُضاف الحقل للنسخة المحلية)
        const payload =
          data && typeof data === "object" && !Array.isArray(data) && serverStamp
            ? { ...data, [W_SERVER_STAMP_FIELD]: serverStamp }
            : data;
        await dbFirestore
          .collection(collectionName)
          .doc(String(docId))
          .set(payload, { merge: true });
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
let __lastLogSignature = null;
let __lastLogSignatureTime = 0;

function addSystemLog(actionDesc) {
  const currentUser = window.currentUser || { name: "النظام" };
  const now = new Date();
  const timeString = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
  const nowMs = Date.now();

  const newLog = {
    id: "log_" + nowMs,
    userName: currentUser.name,
    action: actionDesc,
    timestamp: timeString,
    createdAt: nowMs,
  };

  if (!Array.isArray(window.appStore.logs)) window.appStore.logs = [];
  window.appStore.logs.unshift(newLog);
  if (window.appStore.logs.length > 200) {
    window.appStore.logs.pop();
  }

  // حماية بسيطة: إذا تكرر نفس الإجراء لنفس المستخدم خلال أقل من ثانية
  // (وهو ما لا يحدث في الاستخدام الطبيعي)، يتم تجاهل الرفع للسحابة فقط
  // لمنع أي حلقة غير مقصودة من إغراق حصة الكتابة، دون التأثير على
  // السجل المحلي أو على أي استخدام طبيعي للتطبيق.
  const signature = currentUser.name + "|" + actionDesc;
  if (
    signature === __lastLogSignature &&
    nowMs - __lastLogSignatureTime < 1000
  ) {
    return;
  }
  __lastLogSignature = signature;
  __lastLogSignatureTime = nowMs;

  saveToCloud("logs", newLog.id, newLog);
}

// تشغيل الفايربيز عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
  initFirebaseApp();
});
