// استدعاء مكتبات فايربيس الخاصة بالعمل في خلفية المتصفح (بنفس الإصدار 8.10.1 المستخدم في نظامك)
importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
importScripts(
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js",
);

// -------------------------------------------------------------------------
// إعدادات فايربيس الحقيقية لمشروعك (hadith-system-92058)
// -------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBuSNVMvwhKLgrPxVLo5n5sD6c_BLYsqT8",
  authDomain: "hadith-system-92058.firebaseapp.com",
  projectId: "hadith-system-92058",
  storageBucket: "hadith-system-92058.firebasestorage.app",
  messagingSenderId: "863793007314",
  appId: "1:863793007314:web:437a6c149455b95af33b0b",
};

// تهيئة الاتصال بـ Firebase في الخلفية
firebase.initializeApp(firebaseConfig);

// استدعاء خدمة الرسائل
const messaging = firebase.messaging();

// -------------------------------------------------------------------------
// وظيفة استقبال الرسالة والموقع مغلق وإظهارها في الشريط العلوي للجوال 📲🔔
// -------------------------------------------------------------------------
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] تم استلام إشعار في الخلفية: ",
    payload,
  );

  // استخراج عنوان الإشعار ونصه من الرسالة المرسلة
  const notificationTitle =
    payload.notification?.title || "تنبيه جديد من إدارة الحلقات";
  const notificationOptions = {
    body:
      payload.notification?.body ||
      "لديك إشعار جديد في نظام حلقات الحديث، اضغط للعرض.",
    // أيقونة الجمعية التي ستظهر بجانب التنبيه في شريط الجوال
    icon: "/logo1.png",
    badge: "/logo1.png",
    // إعدادات إضافية لجعل الهاتف يهتز ويصدر تنبيه
    vibrate: [200, 100, 200, 100, 200, 100, 200],
    requireInteraction: true, // يبقى التنبيه في شاشة الجوال حتى يضغط عليه أو يمسحه المستخدم
    data: {
      url: payload.data?.click_action || "/", // الرابط الذي سيفتح عند الضغط على التنبيه
    },
  };

  // إطلاق التنبيه الفوري في شاشة الجوال
  return self.registration.showNotification(
    notificationTitle,
    notificationOptions,
  );
});

// ماذا يحدث عندما يضغط المستفيد على التنبيه بأصبعه من شاشة جواله؟
self.addEventListener("notificationclick", (event) => {
  console.log("[firebase-messaging-sw.js] تم الضغط على الإشعار.");
  event.notification.close(); // إغلاق التنبيه من الشريط العلوي بعد الضغط عليه

  // فتح بوابة النظام أمام الطالب أو المعلم فوراً عند الضغط
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // إذا كان المتصفح مفتوحاً أصلاً في الخلفية، قم بفتحه ونقله للشاشة الرئيسية
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url && "focus" in client) {
            return client.focus();
          }
        }
        // إذا كان الموقع مغلقاً بالكامل، قم بفتح صفحة جديدة للنظام
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      }),
  );
});
