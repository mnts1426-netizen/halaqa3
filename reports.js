/**
 * ==========================================================================
 * reports.js - محرك التقارير الشاملة الرقمية، إنجاز طالبة، وتصدير PDF المباشر
 * دار المُهتدية النسائية — جامع الهدى
 * ==========================================================================
 */

// تنسيق تاريخ محلي "YYYY-MM-DD" بدون المرور عبر toISOString() (التي تحوّل للتوقيت العالمي
// UTC فتُرجع أحياناً اليوم السابق في المناطق ذات الفارق الموجب كالسعودية UTC+3، وهي
// السبب الجذري لظهور "اليوم السابق" بدل التاريخ المطلوب فعلياً في أسماء ملفات التقارير)
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// تنسيق "اسم اليوم شهر/يوم" لعرض أكثر وضوحاً في تقارير السجل اليومي
function formatArabicDayAndDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const days = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];
  const dayName = days[d.getDay()];
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${dayName} ${m}/${day}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const reportTypeSelect = document.getElementById("report-type-select");
  if (reportTypeSelect) {
    handleReportTypeChange();
  }
  populateReportStudentsDropdown();
  populateReportWeekRangeDropdowns();

  // ضبط التاريخ التلقائي على اليوم الحالي لتسهيل الاستخدام
  const dateFromInput = document.getElementById("report-date-from");
  const dateToInput = document.getElementById("report-date-to");
  const today = toLocalDateStr(new Date());
  if (dateFromInput && !dateFromInput.value) dateFromInput.value = today;
  if (dateToInput && !dateToInput.value) dateToInput.value = today;
});

// نقطة انطلاق ترقيم أسابيع التميز (الأسبوع الأول): يوم الأحد 17 ربيع الأول 1448هـ (30 أغسطس 2026م)
const TAMAYUZ_EPOCH_SUNDAY = new Date(2026, 7, 30);

function getHijriShortLabel(date) {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "numeric",
    }).formatToParts(date);
    const day = parts.find((p) => p.type === "day")?.value || "";
    const month = parts.find((p) => p.type === "month")?.value || "";
    return day && month ? `${day}/${month}` : "";
  } catch (e) {
    return "";
  }
}

function getCurrentTamayuzWeekNumber() {
  const now = new Date();
  const nowSunday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - now.getDay(),
  );
  const diffDays = Math.round(
    (nowSunday - TAMAYUZ_EPOCH_SUNDAY) / (24 * 60 * 60 * 1000),
  );
  const weekNum = Math.floor(diffDays / 7) + 1;
  return weekNum < 1 ? 1 : weekNum;
}

function getSundayDateForWeekNumber(weekNumber) {
  const d = new Date(TAMAYUZ_EPOCH_SUNDAY);
  d.setDate(d.getDate() + (weekNumber - 1) * 7);
  return d;
}

// تعبئة قوائم نطاق أسابيع التميز (من - إلى) بترقيم مطلق ثابت مبني على نقطة انطلاق
// (تاريخ الأحد الأول)، مع عرض التاريخ الهجري المقابل لكل أسبوع بجانب رقمه
function populateReportWeekRangeDropdowns() {
  const weekFromSelect = document.getElementById("report-week-from");
  const weekToSelect = document.getElementById("report-week-to");
  if (!weekFromSelect || !weekToSelect) return;

  const currentWeekNum = getCurrentTamayuzWeekNumber();

  let optionsHtml = "";
  for (let n = 1; n <= currentWeekNum; n++) {
    const hijriLabel = getHijriShortLabel(getSundayDateForWeekNumber(n));
    optionsHtml += `<option value="${n}">الأسبوع ${n}${hijriLabel ? ` (${hijriLabel})` : ""}</option>`;
  }

  weekFromSelect.innerHTML = optionsHtml;
  weekToSelect.innerHTML = optionsHtml;
  weekToSelect.value = String(currentWeekNum);
  weekFromSelect.value = String(Math.max(1, currentWeekNum - 4));
}

function populateReportStudentsDropdown() {
  const studentSelect = document.getElementById("report-student-select");
  const circleId =
    document.getElementById("report-circle-select")?.value || "all";
  if (!studentSelect) return;

  const user = window.currentUser;
  const currentVal = studentSelect.value || "all";
  let students = (window.appStore.students || []).filter(
    (s) => s.status === "active",
  );

  // حصر الطالبات في حلقات المعلمة إذا كانت المسجلة معلمة
  if (user && user.role === "teacher") {
    const teacherObj = (window.appStore?.teachers || []).find(
      (t) =>
        t.userId === user.id ||
        t.id === user.teacherId ||
        t.id === user.id ||
        t.phone === user.phone,
    );
    const teacherId = teacherObj ? teacherObj.id : user.teacherId || user.id;
    const teacherCircles = (window.appStore?.circles || []).filter(
      (c) =>
        (Array.isArray(c.teacherIds) && c.teacherIds.includes(teacherId)) ||
        c.teacherId === teacherId,
    );
    const teacherCircleIds = teacherCircles.map((c) => c.id);
    students = students.filter((s) => teacherCircleIds.includes(s.circleId));
  }

  if (circleId !== "all") {
    students = students.filter((s) => s.circleId === circleId);
  }

  let optionsHtml = '<option value="all">كل الطالبات</option>';
  students.forEach((s) => {
    optionsHtml += `<option value="${s.id}">${s.name}</option>`;
  });

  studentSelect.innerHTML = optionsHtml;
  if (students.some((s) => s.id === currentVal)) {
    studentSelect.value = currentVal;
  } else {
    studentSelect.value = "all";
  }
}

function handleReportTypeChange() {
  const reportType = document.getElementById("report-type-select")?.value;
  const circleGroup = document.getElementById("report-circle-group");
  const studentGroup = document.getElementById("report-student-group");
  const weekRangeGroup = document.getElementById("report-week-range-group");
  const dateFromGroup = document.getElementById("report-date-from-group");
  const dateToGroup = document.getElementById("report-date-to-group");
  const thead = document.getElementById("report-thead");
  const tbody = document.getElementById("report-tbody");

  if (circleGroup) circleGroup.style.display = "block";
  if (studentGroup) studentGroup.style.display = "block";

  if (reportType === "tamayuz") {
    if (weekRangeGroup) weekRangeGroup.classList.remove("style-hidden");
    if (dateFromGroup) dateFromGroup.style.display = "none";
    if (dateToGroup) dateToGroup.style.display = "none";
    populateReportWeekRangeDropdowns();
  } else if (reportType === "circle_daily") {
    // تقرير إنجاز يوم الحلقة مخصص لكامل طالبات الحلقة في يوم محدد
    if (studentGroup) studentGroup.style.display = "none";
    if (weekRangeGroup) weekRangeGroup.classList.add("style-hidden");
    if (dateFromGroup) {
      dateFromGroup.style.display = "block";
      const lbl = dateFromGroup.querySelector("label");
      if (lbl) lbl.textContent = "تاريخ اليوم المحدد";
    }
    if (dateToGroup) dateToGroup.style.display = "none";
  } else if (reportType === "student_daily") {
    if (studentGroup) studentGroup.style.display = "block";
    if (weekRangeGroup) weekRangeGroup.classList.add("style-hidden");
    if (dateFromGroup) {
      dateFromGroup.style.display = "block";
      const lbl = dateFromGroup.querySelector("label");
      if (lbl) lbl.textContent = "من تاريخ";
    }
    if (dateToGroup) dateToGroup.style.display = "block";
  } else {
    if (weekRangeGroup) weekRangeGroup.classList.add("style-hidden");
    if (dateFromGroup) {
      dateFromGroup.style.display = "block";
      const lbl = dateFromGroup.querySelector("label");
      if (lbl) lbl.textContent = "من تاريخ";
    }
    if (dateToGroup) dateToGroup.style.display = "block";
  }

  if (tbody) {
    tbody.innerHTML =
      '<tr><td class="text-center text-muted p-4">حددي خيارات التقرير ثم اضغطي على "استخراج التقرير"</td></tr>';
  }
  if (thead) thead.innerHTML = "";
}

// يحسب تواريخ أيام الأحد إلى الأربعاء (أيام أسبوع التميز الأربعة) لأسبوع مُرقَّم
// مطلق (بدءاً من نقطة انطلاق ثابتة)، بدلاً من الاعتماد على أسماء أسابيع نسبية لليوم الحالي
function getSundayToWednesdayDatesForWeekNumber(weekNumber) {
  const sunday = getSundayDateForWeekNumber(weekNumber);
  const days = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    days.push(toLocalDateStr(d));
  }
  return days;
}

async function generateReport() {
  const thead = document.getElementById("report-thead");
  const tbody = document.getElementById("report-tbody");

  const reportType = document.getElementById("report-type-select")?.value;
  const selectedStudentId =
    document.getElementById("report-student-select")?.value || "all";
  const circleId =
    document.getElementById("report-circle-select")?.value || "all";
  const dateFrom = document.getElementById("report-date-from")?.value;
  const dateTo = document.getElementById("report-date-to")?.value;
  const currentTamayuzWeekNum = getCurrentTamayuzWeekNumber();
  const weekFrom =
    document.getElementById("report-week-from")?.value ||
    String(Math.max(1, currentTamayuzWeekNum - 4));
  const weekTo =
    document.getElementById("report-week-to")?.value ||
    String(currentTamayuzWeekNum);

  // التقارير قد تحتاج تاريخاً أقدم من نافذة المزامنة اللحظية المحدودة، لذا نجلب
  // تاريخ الحضور والتسميع مرة واحدة عند الطلب هنا فقط - لكن بدءاً من أقدم تاريخ
  // يحتاجه التقرير المطلوب فعلياً (وليس كل التاريخ منذ إنشاء الدار)، لتقليل
  // القراءات مع تراكم السنوات. إن لم يُحدَّد أي تاريخ (تقرير "كامل الفترة")
  // يبقى الجلب الكامل كما كان تماماً حفاظاً على نفس السلوك المعتاد.
  let reportSinceDate = dateFrom || null;
  if (!reportSinceDate && reportType === "tamayuz") {
    const weekFromNum = parseInt(weekFrom, 10);
    if (!isNaN(weekFromNum)) {
      reportSinceDate = toLocalDateStr(getSundayDateForWeekNumber(weekFromNum));
    }
  } else if (!reportSinceDate && reportType === "student_daily") {
    reportSinceDate = "2026-08-30";
  }

  if (typeof window.ensureFullAttendanceTasmeeaHistory === "function") {
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center text-muted p-4">جاري تحميل بيانات التقرير...</td></tr>';
    }
    await window.ensureFullAttendanceTasmeeaHistory(reportSinceDate);
  }

  const printTitle = document.getElementById("print-report-title");
  const printPeriod = document.getElementById("print-report-period");

  if (!thead || !tbody) return;

  let headHtml = "";
  let bodyHtml = "";

  // 1. تقرير إنجاز طالبة
  if (reportType === "student_achievement") {
    if (printTitle) printTitle.textContent = "تقرير إنجاز طالبة";

    if (printPeriod) {
      if (dateFrom && dateTo) {
        printPeriod.textContent = `الفترة: من تاريخ ${dateFrom} إلى تاريخ ${dateTo}`;
      } else if (dateFrom) {
        printPeriod.textContent = `من تاريخ: ${dateFrom}`;
      } else if (dateTo) {
        printPeriod.textContent = `إلى تاريخ: ${dateTo}`;
      } else {
        printPeriod.textContent = "كامل الفترة المسجلة";
      }
      printPeriod.style.display = "block";
    }

    headHtml = `
      <tr style="background: var(--primary-brown); color: #fff;">
        <th style="width: 50px; text-align: center;">م</th>
        <th>اسم الطالبة</th>
        <th>الحلقة</th>
        <th>الدرس الجديد</th>
        <th>المراجعة</th>
        <th>التلاوة</th>
      </tr>
    `;

    let students = (window.appStore.students || []).filter(
      (s) => s.status !== "pending",
    );

    if (circleId !== "all") {
      students = students.filter((s) => s.circleId === circleId);
    }
    if (selectedStudentId !== "all") {
      students = students.filter((s) => s.id === selectedStudentId);
    }

    if (students.length === 0) {
      bodyHtml =
        '<tr><td colspan="6" class="text-center text-muted p-4">لا توجد بيانات مطابقة للطالبات</td></tr>';
    } else {
      students.forEach((s, idx) => {
        const circle = (window.appStore.circles || []).find(
          (c) => c.id === s.circleId,
        );
        const circleName = circle ? circle.name : "غير مسجلة";

        let records = (window.appStore.tasmeea || []).filter(
          (t) => t.studentId === s.id,
        );
        if (dateFrom) records = records.filter((t) => t.date >= dateFrom);
        if (dateTo) records = records.filter((t) => t.date <= dateTo);
        records.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        const formatBranchSpan = (fieldSurah) => {
          const validRecords = records.filter((r) => r[fieldSurah]);
          if (validRecords.length === 0)
            return '<span class="text-muted">—</span>';

          const first = validRecords[0];
          const last = validRecords[validRecords.length - 1];

          if (
            validRecords.length === 1 ||
            first[fieldSurah] === last[fieldSurah]
          ) {
            return `<strong>${first[fieldSurah]}</strong>`;
          }

          return `من: <strong>${first[fieldSurah]}</strong><br>إلى: <strong>${last[fieldSurah]}</strong>`;
        };

        const hifzSpan = formatBranchSpan("hifzSurah");
        const murajaaSpan = formatBranchSpan("murajaaSurah");
        const tilawaSpan = formatBranchSpan("tilawaSurah");

        bodyHtml += `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td style="font-weight: 800;">${s.name}</td>
            <td><span style="font-weight: 600; color: var(--text-dark);">${circleName}</span></td>
            <td style="line-height: 1.5;">${hifzSpan}</td>
            <td style="line-height: 1.5;">${murajaaSpan}</td>
            <td style="line-height: 1.5;">${tilawaSpan}</td>
          </tr>
        `;
      });
    }
  }

  // 2. التقرير الإحصائي الشامل للطالبات
  else if (reportType === "students") {
    if (printTitle)
      printTitle.textContent =
        "التقرير الإحصائي الشامل للطالبات (أعداد الإنجاز والحضور)";

    if (printPeriod) {
      if (dateFrom && dateTo) {
        printPeriod.textContent = `الفترة: من تاريخ ${dateFrom} إلى تاريخ ${dateTo}`;
      } else if (dateFrom) {
        printPeriod.textContent = `من تاريخ: ${dateFrom}`;
      } else if (dateTo) {
        printPeriod.textContent = `إلى تاريخ: ${dateTo}`;
      } else {
        printPeriod.textContent = "كامل الفترة المسجلة";
      }
      printPeriod.style.display = "block";
    }

    headHtml = `
      <tr style="background: var(--primary-brown); color: #fff;">
        <th style="width: 35px; text-align: center;">م</th>
        <th>اسم الطالبة</th>
        <th style="text-align: center;">أيام الحضور</th>
        <th style="text-align: center;">أيام التأخر</th>
        <th style="text-align: center;">أيام الاستئذان</th>
        <th style="text-align: center;">أيام الغياب</th>
        <th style="text-align: center;">بطاقات التميز</th>
        <th style="text-align: center;">مرحليات</th>
        <th style="text-align: center;">ممتاز</th>
        <th style="text-align: center;">جيد جداً</th>
        <th style="text-align: center;">جيد</th>
        <th style="text-align: center;">يعيد</th>
      </tr>
    `;

    let students = (window.appStore.students || []).filter(
      (s) => s.status !== "pending",
    );

    if (circleId !== "all") {
      students = students.filter((s) => s.circleId === circleId);
    }
    if (selectedStudentId !== "all") {
      students = students.filter((s) => s.id === selectedStudentId);
    }

    if (students.length === 0) {
      bodyHtml =
        '<tr><td colspan="12" class="text-center text-muted p-4">لا توجد بيانات مطابقة</td></tr>';
    } else {
      students.forEach((s, idx) => {
        let stuAtt = (window.appStore.attendance || []).filter(
          (a) => a.studentId === s.id,
        );
        if (dateFrom) stuAtt = stuAtt.filter((a) => a.date >= dateFrom);
        if (dateTo) stuAtt = stuAtt.filter((a) => a.date <= dateTo);

        const presentCount = stuAtt.filter(
          (a) => a.status === "present",
        ).length;
        const lateCount = stuAtt.filter((a) => a.status === "late").length;
        const excusedCount = stuAtt.filter(
          (a) => a.status === "excused",
        ).length;
        const absentCount = stuAtt.filter((a) => a.status === "absent").length;

        // بطاقات التميز: نفس منطق لوحة نجمات التميز الأسبوعي (آخر 16 أسبوعاً)
        let tamayuzCount = 0;
        if (typeof checkStudentCurrentWeekTamayuz === "function") {
          for (let w = 0; w < 16; w++) {
            if (checkStudentCurrentWeekTamayuz(s.id, w)) tamayuzCount++;
          }
        }

        // مرحليات (عدد الاختبارات)
        const testsCount = (window.appStore.tests || []).filter(
          (t) => t.studentId === s.id,
        ).length;

        // التقديرات (ممتاز / جيد جداً / جيد / يعيد) في كل المقررات مجتمعة
        let tasmList = (window.appStore.tasmeea || []).filter(
          (t) => t.studentId === s.id,
        );
        if (dateFrom) tasmList = tasmList.filter((t) => t.date >= dateFrom);
        if (dateTo) tasmList = tasmList.filter((t) => t.date <= dateTo);

        const countRatingTotal = (type) => {
          let count = 0;
          tasmList.forEach((t) => {
            ["hifzRating", "murajaaRating", "tilawaRating"].forEach((f) => {
              const val = (t[f] || "").trim();
              if (type === "ممتاز" && val.includes("ممتاز")) count++;
              else if (type === "جيد جداً" && val.includes("جيد جداً"))
                count++;
              else if (type === "جيد" && val === "جيد") count++;
              else if (type === "يعيد" && (val === "يعيد" || val === "ضعيف"))
                count++;
            });
          });
          return count;
        };

        bodyHtml += `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td style="font-weight: 800;">${escapeHtml(s.name)}</td>
            <td style="font-weight: 700; color: #2e7d32; text-align: center;">${presentCount}</td>
            <td style="font-weight: 700; color: #b78103; text-align: center;">${lateCount}</td>
            <td style="font-weight: 700; color: #1565c0; text-align: center;">${excusedCount}</td>
            <td style="font-weight: 700; color: #c62828; text-align: center;">${absentCount}</td>
            <td style="font-weight: 700; color: var(--primary-brown); text-align: center;">${tamayuzCount}</td>
            <td style="text-align: center;">${testsCount}</td>
            <td style="font-weight: 700; color: #2e7d32; text-align: center;">${countRatingTotal("ممتاز")}</td>
            <td style="font-weight: 700; color: var(--primary-brown); text-align: center;">${countRatingTotal("جيد جداً")}</td>
            <td style="font-weight: 700; text-align: center;">${countRatingTotal("جيد")}</td>
            <td style="font-weight: 700; color: #c62828; text-align: center;">${countRatingTotal("يعيد")}</td>
          </tr>
        `;
      });
    }
  }

  // 3. تقرير سجل التسميع اليومي
  else if (reportType === "tasmeea") {
    if (printTitle)
      printTitle.textContent = "تقرير إنجاز وسجل التسميع والدرس الجديد";

    if (printPeriod) {
      if (dateFrom && dateTo) {
        printPeriod.textContent = `الفترة: من تاريخ ${dateFrom} إلى تاريخ ${dateTo}`;
      } else if (dateFrom) {
        printPeriod.textContent = `من تاريخ: ${dateFrom}`;
      } else if (dateTo) {
        printPeriod.textContent = `إلى تاريخ: ${dateTo}`;
      } else {
        printPeriod.textContent = "كامل الفترة المسجلة";
      }
      printPeriod.style.display = "block";
    }

    headHtml = `
      <tr style="background: var(--primary-brown); color: #fff;">
        <th style="width: 50px; text-align: center;">م</th>
        <th>اسم الطالبة</th>
        <th>الدرس الجديد</th>
        <th>المراجعة</th>
        <th>التلاوة</th>
        <th>التقدير</th>
        <th>ملاحظة المعلمة</th>
      </tr>
    `;

    let records = window.appStore.tasmeea || [];
    if (circleId !== "all")
      records = records.filter((r) => r.circleId === circleId);
    if (selectedStudentId !== "all")
      records = records.filter((r) => r.studentId === selectedStudentId);
    if (dateFrom) records = records.filter((r) => r.date >= dateFrom);
    if (dateTo) records = records.filter((r) => r.date <= dateTo);

    if (records.length === 0) {
      bodyHtml =
        '<tr><td colspan="7" class="text-center text-muted p-4">لا توجد سجلات تسميع في هذه الفترة</td></tr>';
    } else {
      records.forEach((t, idx) => {
        const student = (window.appStore.students || []).find(
          (s) => s.id === t.studentId,
        );
        bodyHtml += `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td style="font-weight:700;">${student ? student.name : "طالبة"}</td>
            <td>${t.hifzSurah || "—"}</td>
            <td>${t.murajaaSurah || "—"}</td>
            <td>${t.tilawaSurah || "—"}</td>
            <td>${t.rating || t.hifzRating || "—"}</td>
            <td>${t.studentNotes || "—"}</td>
          </tr>
        `;
      });
    }
  }

  // 4. تقرير نجمات التميز الأسبوعي
  else if (reportType === "tamayuz") {
    if (printTitle)
      printTitle.textContent =
        "تقرير نجمات التميز الأسبوعي (عدد بطاقات التميز)";

    if (printPeriod) {
      printPeriod.textContent = `نطاق الأسابيع (من الأسبوع ${weekFrom} إلى الأسبوع ${weekTo})`;
      printPeriod.style.display = "block";
    }

    headHtml = `
      <tr style="background: var(--primary-brown); color: #fff;">
        <th style="width: 60px; text-align: center;">م</th>
        <th>اسم الطالبة</th>
        <th>الحلقة</th>
        <th style="text-align: center;">عدد بطاقات التميز</th>
      </tr>
    `;

    let students = (window.appStore.students || []).filter(
      (s) => s.status === "active",
    );

    if (circleId !== "all") {
      students = students.filter((s) => s.circleId === circleId);
    }
    if (selectedStudentId !== "all") {
      students = students.filter((s) => s.id === selectedStudentId);
    }

    const weekFromNum = parseInt(weekFrom, 10);
    const weekToNum = parseInt(weekTo, 10);
    const selectedWeeks = [];
    if (
      !isNaN(weekFromNum) &&
      !isNaN(weekToNum) &&
      weekToNum >= weekFromNum
    ) {
      for (let w = weekFromNum; w <= weekToNum; w++) selectedWeeks.push(w);
    } else {
      selectedWeeks.push(getCurrentTamayuzWeekNumber());
    }

    const isCleanMumtazOrEmpty = (r) => {
      if (!r) return true;
      const clean = String(r).trim();
      if (clean === "" || clean === "—" || clean === "-" || clean === "لا يوجد")
        return true;
      return clean.includes("ممتاز");
    };

    const studentBadgesCount = [];

    students.forEach((s) => {
      let badgesSum = 0;

      selectedWeeks.forEach((wk) => {
        const weekDays = getSundayToWednesdayDatesForWeekNumber(wk);
        if (!weekDays || weekDays.length !== 4) return;

        let isQualifiedForWeek = true;

        for (const day of weekDays) {
          const att = (window.appStore?.attendance || []).find(
            (a) => a.studentId === s.id && a.date === day,
          );
          if (!att || (att.status !== "present" && att.status !== "late")) {
            isQualifiedForWeek = false;
            break;
          }

          const tasm = (window.appStore?.tasmeea || []).find(
            (t) => t.studentId === s.id && t.date === day,
          );
          // لا يوجد سجل تسميع مُعتمَد فعلياً لهذا اليوم = يُعامل كـ"يعيد" (يمنع مرور
          // طالبة "مُرحَّل" لها لم يُعتمد لها شيء فعلياً من قبل المعلمة كمتميزة)
          if (!tasm) {
            isQualifiedForWeek = false;
            break;
          }
          {
            if (
              !isCleanMumtazOrEmpty(tasm.hifzRating) ||
              !isCleanMumtazOrEmpty(tasm.murajaaRating) ||
              !isCleanMumtazOrEmpty(tasm.tilawaRating) ||
              !isCleanMumtazOrEmpty(tasm.rating)
            ) {
              isQualifiedForWeek = false;
              break;
            }
          }
        }

        if (isQualifiedForWeek) {
          badgesSum++;
        }
      });

      if (badgesSum > 0) {
        studentBadgesCount.push({ student: s, count: badgesSum });
      }
    });

    if (studentBadgesCount.length === 0) {
      bodyHtml =
        '<tr><td colspan="4" class="text-center text-muted p-4">لا توجد بطاقات تميز مسجلة للطالبات في نطاق الأسابيع المحدد (يشترط حضور 4 أيام كاملة وتقييم ممتاز فقط)</td></tr>';
    } else {
      studentBadgesCount.forEach((item, idx) => {
        const circle = (window.appStore?.circles || []).find(
          (c) => c.id === item.student.circleId,
        );
        const circleName = circle ? circle.name : "جامع الهدى";

        bodyHtml += `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td style="font-weight: 800;">⭐ ${item.student.name}</td>
            <td><span style="font-weight: 600; color: var(--text-dark);">${circleName}</span></td>
            <td style="text-align: center; font-weight: 900; color: var(--primary-brown); font-size: 1.05rem;">
              🎖️ ${item.count} بطاقات
            </td>
          </tr>
        `;
      });
    }
  }

  // 5. تقرير إنجاز طالبات الحلقة اليومي (لقطة يوم واحد لكل طالبات الحلقة)
  else if (reportType === "circle_daily") {
    if (printTitle)
      printTitle.textContent = "تقرير إنجاز طالبات الحلقة اليومي";

    const targetDate = dateFrom || dateTo || toLocalDateStr(new Date());
    if (printPeriod) {
      printPeriod.textContent = `اليوم المحدد: ${formatArabicDayAndDate(targetDate)}`;
      printPeriod.style.display = "block";
    }

    headHtml = `
      <tr style="background: var(--primary-brown); color: #fff;">
        <th style="width: 40px; text-align: center;">م</th>
        <th>اسم الطالبة</th>
        <th>حالة التحضير</th>
        <th>منهج الدرس</th>
        <th>التقدير</th>
        <th>منهج المراجعة</th>
        <th>التقدير</th>
        <th>منهج التلاوة</th>
        <th>التقدير</th>
      </tr>
    `;

    if (circleId === "all") {
      bodyHtml =
        '<tr><td colspan="9" class="text-center text-muted p-4">يرجى اختيار الحلقة أولاً لعرض هذا التقرير</td></tr>';
    } else {
      let students = (window.appStore.students || []).filter(
        (s) =>
          s.circleId === circleId &&
          s.status !== "pending" &&
          s.status !== "archived",
      );
      students.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));

      if (students.length === 0) {
        bodyHtml =
          '<tr><td colspan="9" class="text-center text-muted p-4">لا توجد طالبات مسجلات بهذه الحلقة</td></tr>';
      } else {
        students.forEach((s, idx) => {
          const att = (window.appStore.attendance || []).find(
            (a) => a.studentId === s.id && a.date === targetDate,
          );
          let attStatus = "غير مسجل";
          if (att) {
            if (att.status === "present") attStatus = "حاضرة";
            else if (att.status === "absent") attStatus = "غائبة";
            else if (att.status === "late") attStatus = "متأخرة";
            else if (att.status === "excused") attStatus = "مستأذنة";
          }

          const tasm =
            (window.appStore.tasmeea || []).find(
              (t) => t.studentId === s.id && t.date === targetDate,
            ) || {};

          bodyHtml += `
            <tr>
              <td style="text-align: center;">${idx + 1}</td>
              <td style="font-weight: 800;">${escapeHtml(s.name)}</td>
              <td style="text-align: center;">${attStatus}</td>
              <td>${escapeHtml(tasm.hifzSurah) || "لا يوجد"}</td>
              <td style="text-align: center;">${escapeHtml(tasm.hifzRating) || "—"}</td>
              <td>${escapeHtml(tasm.murajaaSurah) || "لا يوجد"}</td>
              <td style="text-align: center;">${escapeHtml(tasm.murajaaRating) || "—"}</td>
              <td>${escapeHtml(tasm.tilawaSurah) || "لا يوجد"}</td>
              <td style="text-align: center;">${escapeHtml(tasm.tilawaRating) || "—"}</td>
            </tr>
          `;
        });
      }
    }
  }

  // 6. تقرير إنجاز طالبة محددة يوماً بيوم عبر فترة زمنية
  else if (reportType === "student_daily") {
    if (selectedStudentId === "all") {
      alert("⚠️ يرجى اختيار الطالبة المستهدفة لاستخراج تقرير إنجازها اليومي.");
      thead.innerHTML = "";
      tbody.innerHTML =
        '<tr><td class="text-center text-muted p-4">يرجى اختيار الطالبة أولاً</td></tr>';
      return;
    }

    const studentObj = (window.appStore.students || []).find(
      (s) => s.id === selectedStudentId,
    );
    if (printTitle) printTitle.textContent = "تقرير إنجاز طالبة محددة";

    // في هذا التقرير تحديداً تظهر مكان الفترة بيانات الطالبة نفسها (اسمها) بدل التاريخ،
    // لأن التقرير أصلاً مخصص لطالبة واحدة محددة معروفة سلفاً من القائمة المنسدلة
    const startStr = dateFrom || "2026-08-30";
    const endStr = dateTo || toLocalDateStr(new Date());
    if (printPeriod) {
      printPeriod.textContent = `الطالبة: ${studentObj ? studentObj.name : "—"}`;
      printPeriod.style.display = "block";
    }

    headHtml = `
      <tr style="background: var(--primary-brown); color: #fff;">
        <th>اليوم والتاريخ</th>
        <th>حالة التحضير</th>
        <th>منهج الدرس</th>
        <th>التقدير</th>
        <th>منهج المراجعة</th>
        <th>التقدير</th>
        <th>منهج التلاوة</th>
        <th>التقدير</th>
      </tr>
    `;

    const dateList = [];
    const cur = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");
    while (cur <= end) {
      dateList.push(toLocalDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }

    if (dateList.length === 0) {
      bodyHtml =
        '<tr><td colspan="8" class="text-center text-muted p-4">لا توجد أيام مطابقة ضمن الفترة المحددة</td></tr>';
    } else {
      dateList.forEach((dStr) => {
        const dayFormatted = formatArabicDayAndDate(dStr);
        const att = (window.appStore.attendance || []).find(
          (a) => a.studentId === selectedStudentId && a.date === dStr,
        );
        let attStatus = "غير مسجل";
        if (att) {
          if (att.status === "present") attStatus = "حاضرة";
          else if (att.status === "absent") attStatus = "غائبة";
          else if (att.status === "late") attStatus = "متأخرة";
          else if (att.status === "excused") attStatus = "مستأذنة";
        }

        const tasm =
          (window.appStore.tasmeea || []).find(
            (t) => t.studentId === selectedStudentId && t.date === dStr,
          ) || {};

        bodyHtml += `
          <tr>
            <td style="font-weight: 700;">${dayFormatted}</td>
            <td style="text-align: center;">${attStatus}</td>
            <td>${escapeHtml(tasm.hifzSurah) || "لا يوجد"}</td>
            <td style="text-align: center;">${escapeHtml(tasm.hifzRating) || "لا يوجد"}</td>
            <td>${escapeHtml(tasm.murajaaSurah) || "لا يوجد"}</td>
            <td style="text-align: center;">${escapeHtml(tasm.murajaaRating) || "لا يوجد"}</td>
            <td>${escapeHtml(tasm.tilawaSurah) || "لا يوجد"}</td>
            <td style="text-align: center;">${escapeHtml(tasm.tilawaRating) || "لا يوجد"}</td>
          </tr>
        `;
      });
    }
  }

  // 7. تقرير بداية ونهاية المنهج (بداية ونهاية ما وصلت إليه كل طالبة في كل مقرر)
  else if (reportType === "curriculum_start_end") {
    if (printTitle) printTitle.textContent = "تقرير بداية ونهاية المنهج";

    if (printPeriod) {
      if (dateFrom && dateTo) {
        printPeriod.textContent = `الفترة: من تاريخ ${dateFrom} إلى تاريخ ${dateTo}`;
      } else if (dateFrom) {
        printPeriod.textContent = `من تاريخ: ${dateFrom}`;
      } else if (dateTo) {
        printPeriod.textContent = `إلى تاريخ: ${dateTo}`;
      } else {
        printPeriod.textContent = "كامل الفترة المسجلة";
      }
      printPeriod.style.display = "block";
    }

    headHtml = `
      <tr style="background: var(--primary-brown); color: #fff;">
        <th style="width: 40px; text-align: center;">م</th>
        <th>اسم الطالبة</th>
        <th>منهج درس</th>
        <th>منهج مراجعة</th>
        <th>منهج تلاوة</th>
      </tr>
    `;

    let students = (window.appStore.students || []).filter(
      (s) =>
        s.circleId === circleId &&
        s.status !== "pending" &&
        s.status !== "archived",
    );
    if (selectedStudentId !== "all") {
      students = students.filter((s) => s.id === selectedStudentId);
    }
    students.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));

    if (circleId === "all") {
      bodyHtml =
        '<tr><td colspan="5" class="text-center text-muted p-4">يرجى اختيار الحلقة أولاً لعرض هذا التقرير</td></tr>';
    } else if (students.length === 0) {
      bodyHtml =
        '<tr><td colspan="5" class="text-center text-muted p-4">لا توجد بيانات مطابقة للطالبات</td></tr>';
    } else {
      students.forEach((s, idx) => {
        let tasmList = (window.appStore.tasmeea || []).filter(
          (t) => t.studentId === s.id,
        );
        if (dateFrom) tasmList = tasmList.filter((t) => t.date >= dateFrom);
        if (dateTo) tasmList = tasmList.filter((t) => t.date <= dateTo);
        tasmList.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        const hifzWithVal = tasmList.filter(
          (t) => t.hifzSurah && t.hifzSurah.trim() !== "",
        );
        const murajaaWithVal = tasmList.filter(
          (t) => t.murajaaSurah && t.murajaaSurah.trim() !== "",
        );
        const tilawaWithVal = tasmList.filter(
          (t) => t.tilawaSurah && t.tilawaSurah.trim() !== "",
        );

        const hifzStart = hifzWithVal[0]?.hifzSurah || "—";
        const hifzEnd = hifzWithVal[hifzWithVal.length - 1]?.hifzSurah || "—";
        const murajaaStart = murajaaWithVal[0]?.murajaaSurah || "—";
        const murajaaEnd =
          murajaaWithVal[murajaaWithVal.length - 1]?.murajaaSurah || "—";
        const tilawaStart = tilawaWithVal[0]?.tilawaSurah || "—";
        const tilawaEnd =
          tilawaWithVal[tilawaWithVal.length - 1]?.tilawaSurah || "—";

        bodyHtml += `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td style="font-weight: 800;">${escapeHtml(s.name)}</td>
            <td style="line-height: 1.8;">
              <div><strong>البداية :</strong> ${escapeHtml(hifzStart)}</div>
              <div><strong>النهاية :</strong> ${escapeHtml(hifzEnd)}</div>
            </td>
            <td style="line-height: 1.8;">
              <div><strong>البداية :</strong> ${escapeHtml(murajaaStart)}</div>
              <div><strong>النهاية :</strong> ${escapeHtml(murajaaEnd)}</div>
            </td>
            <td style="line-height: 1.8;">
              <div><strong>البداية :</strong> ${escapeHtml(tilawaStart)}</div>
              <div><strong>النهاية :</strong> ${escapeHtml(tilawaEnd)}</div>
            </td>
          </tr>
        `;
      });
    }
  }

  thead.innerHTML = headHtml;
  tbody.innerHTML = bodyHtml;

  // بناء الترويسة والتذييل الرسميين الكاملين (نفس التصميم المعتمد في بقية أرجاء
  // النظام عبر buildOfficialPrintChrome) لعرضهما عند الطباعة/PDF/Word فقط - مركزياً
  // هنا بدل تكرار المنطق داخل كل فرع من فروع أنواع التقارير أعلاه
  const chromeHeaderSlot = document.getElementById("report-print-header");
  const chromeFooterSlot = document.getElementById("report-print-footer");
  if (
    chromeHeaderSlot &&
    typeof window.buildOfficialPrintChrome === "function"
  ) {
    const circleNameForChrome =
      circleId !== "all"
        ? (window.appStore?.circles || []).find((c) => c.id === circleId)
            ?.name || ""
        : "";
    const chrome = window.buildOfficialPrintChrome(
      printTitle?.textContent || "تقرير رسمي",
      circleNameForChrome,
      "",
      printPeriod?.textContent || "",
    );
    chromeHeaderSlot.innerHTML = chrome.header;
    if (chromeFooterSlot) chromeFooterSlot.innerHTML = chrome.footer;
  }
}

function exportReportExcel() {
  const table = document.getElementById("report-results-table");
  if (!table || table.rows.length <= 1) {
    alert("⚠️ لا توجد بيانات في التقرير لتصديرها!");
    return;
  }
  if (typeof XLSX === "undefined") {
    alert("⚠️ مكتبة Excel غير متوفرة!");
    return;
  }
  const wb = XLSX.utils.table_to_book(table, { sheet: "التقرير الرسمي" });
  XLSX.writeFile(wb, `تقرير_الدار_${toLocalDateStr(new Date())}.xlsx`);
}

// يقرأ اختيار اتجاه الصفحة (طولي/عرضي) إن وُجد عنصره في الواجهة، ويحافظ على
// السلوك الحالي (عرضي) افتراضياً إن لم يُضَف عنصر الاختيار للواجهة بعد
function getSelectedReportOrientation() {
  const portraitRadio = document.getElementById("report-orientation-portrait");
  if (portraitRadio) return portraitRadio.checked ? "portrait" : "landscape";
  return "landscape";
}

function downloadReportPDF() {
  const element = document.getElementById("report-results-wrapper");
  if (!element) return;

  const reportTitle =
    document.getElementById("print-report-title")?.textContent || "تقرير_رسمي";
  const orientation = getSelectedReportOrientation();

  if (typeof html2pdf !== "undefined") {
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${reportTitle.trim().replace(/\s+/g, "_")}_${toLocalDateStr(new Date())}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: orientation },
    };
    // ترويسة التقرير الرسمية (.print-official-header) مخفية أثناء العرض العادي على
    // الشاشة وتظهر فقط عبر تنسيقات "@media print" - لكن أداة html2pdf تلتقط لقطة من
    // الصفحة كما تظهر حالياً على الشاشة دون تفعيل هذه التنسيقات، ما كان يجعل الترويسة
    // (الشعار وعنوان التقرير) تختفي تماماً من ملف PDF الناتج. لذا نُظهرها يدوياً هنا
    // فقط أثناء التوليد الفعلي للـPDF ثم نعيدها لحالتها الأصلية فوراً بعد الحفظ.
    const header = element.querySelector(".print-official-header");
    const footer = element.querySelector(".print-official-footer");
    const prevHeaderDisplay = header ? header.style.display : "";
    const prevFooterDisplay = footer ? footer.style.display : "";
    if (header) header.style.display = "block";
    if (footer) footer.style.display = "block";
    const restoreDisplay = () => {
      if (header) header.style.display = prevHeaderDisplay;
      if (footer) footer.style.display = prevFooterDisplay;
    };
    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(restoreDisplay)
      .catch(restoreDisplay);
  } else {
    window.print();
  }
}

// تحويل صورة (شعار) إلى Base64 لتضمينها مباشرة داخل ملف Word - بدون هذا التحويل
// تظهر الشعارات مكسورة عند فتح الملف لأن مسارها النسبي لا يُفهم خارج الموقع نفسه
async function imageToDataUri(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

// تنزيل التقرير كملف Word (بنفس الترويسة والشعار والجدول الظاهر تماماً) عبر تحويل
// محتوى التقرير إلى مستند HTML متوافق مع Word (بدون أي مكتبة خارجية إضافية)
async function downloadReportWord() {
  const element = document.getElementById("report-results-wrapper");
  const tbody = document.getElementById("report-tbody");
  if (!element || !tbody || !tbody.innerHTML.trim()) {
    alert("⚠️ يرجى استخراج التقرير أولاً قبل التنزيل!");
    return;
  }

  const reportTitle =
    document.getElementById("print-report-title")?.textContent || "تقرير_الدار";
  const safeFilename = reportTitle.trim().replace(/\s+/g, "_");

  // تضمين الشعار كـ Base64 داخل نسخة مؤقتة من محتوى التقرير فقط (دون المساس بالعنصر
  // الأصلي الظاهر على الشاشة)، وإظهار الترويسة الرسمية فيها (مخفية أصلاً على الشاشة)
  const contentClone = element.cloneNode(true);
  const clonedHeader = contentClone.querySelector(".print-official-header");
  if (clonedHeader) clonedHeader.style.display = "block";
  const clonedFooter = contentClone.querySelector(".print-official-footer");
  if (clonedFooter) clonedFooter.style.display = "block";

  const logoImgs = Array.from(contentClone.querySelectorAll("img"));
  await Promise.all(
    logoImgs.map(async (img) => {
      const dataUri = await imageToDataUri(img.getAttribute("src"));
      if (dataUri) img.setAttribute("src", dataUri);
    }),
  );

  const wordHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <title>${reportTitle}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Cairo', 'Tajawal', Arial, sans-serif; direction: rtl; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11pt; }
          th, td { border: 1px solid #eedffc; padding: 6px; text-align: center; }
          th { background-color: #6b21a8; color: #ffffff; font-weight: bold; }
        </style>
      </head>
      <body dir="rtl">
        ${contentClone.innerHTML}
      </body>
    </html>
  `;

  const blob = new Blob(["﻿", wordHtml], {
    type: "application/msword",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${safeFilename}_${toLocalDateStr(new Date())}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

// يُدرج الترويسة الرسمية كصف إضافي داخل thead الجدول حتى تتكرر تلقائياً أعلى كل
// صفحة مطبوعة (thead يتكرر أصلاً في كل المتصفحات عند الطباعة) بدل ظهورها أول صفحة فقط
function buildRepeatingHeaderTableHtml(originalTable, headerHtml) {
  const tableClone = originalTable.cloneNode(true);
  const theadClone = tableClone.querySelector("thead");
  if (!theadClone) return headerHtml + tableClone.outerHTML;

  const headerRow = document.createElement("tr");
  const headerCell = document.createElement("td");
  headerCell.colSpan = 30;
  headerCell.style.border = "none";
  headerCell.style.padding = "0";
  headerCell.innerHTML = headerHtml;
  headerRow.appendChild(headerCell);
  theadClone.insertBefore(headerRow, theadClone.firstChild);

  return tableClone.outerHTML;
}

// طباعة رسمية فعلية عبر نافذة طباعة منفصلة (وليست مجرد تنزيل PDF): تُكرَّر الترويسة
// الرسمية أعلى كل صفحة مطبوعة تلقائياً حتى في التقارير الطويلة متعددة الصفحات
function printOfficialReport() {
  const wrapper = document.getElementById("report-results-wrapper");
  const table = document.getElementById("report-results-table");
  const tbody = document.getElementById("report-tbody");
  if (!wrapper || !table || !tbody || !tbody.innerHTML.trim()) {
    alert("⚠️ يرجى استخراج التقرير أولاً قبل الطباعة!");
    return;
  }

  const reportTitle =
    document.getElementById("print-report-title")?.textContent || "تقرير رسمي";
  const orientation = getSelectedReportOrientation();
  const headerEl = wrapper.querySelector(".print-official-header");
  const chromeHeader = headerEl ? headerEl.outerHTML : "";
  const footerEl = wrapper.querySelector(".print-official-footer");
  const chromeFooter = footerEl ? footerEl.outerHTML : "";

  const printableHtml =
    buildRepeatingHeaderTableHtml(table, chromeHeader) + chromeFooter;

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>${reportTitle}</title>
        <style>
          @page {
            size: A4 ${orientation};
            margin: 10mm;
          }
          body {
            font-family: 'Cairo', 'Tajawal', sans-serif;
            direction: rtl;
            padding: 15px;
            background: #fff;
            color: #000;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-official-header, .print-official-footer { display: block !important; }
          table {
            width: 100%;
            table-layout: auto;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 10.5px;
          }
          th, td {
            border: 1px solid #eedffc;
            padding: 6px 4px;
            text-align: center;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          th {
            background-color: #6b21a8 !important;
            color: #ffffff !important;
            font-weight: bold;
          }
          .no-print, button {
            display: none !important;
          }
        </style>
      </head>
      <body>
        ${printableHtml}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();

  // الطباعة كانت أحياناً لا تُخرج شيئاً لأن نافذة الطباعة تُستدعى قبل اكتمال تحميل
  // شعار الترويسة (خصوصاً بعد تكراره بعدة صفحات) - ننتظر تحميله فعلياً بدل مهلة
  // ثابتة قصيرة، مع مهلة أمان قصوى حتى لا تتعلّق الطباعة لو تعذّر تحميل الشعار لسبب ما
  let printTriggered = false;
  const triggerPrint = () => {
    if (printTriggered) return;
    printTriggered = true;
    printWindow.print();
    printWindow.close();
  };

  const pendingImgs = Array.from(printWindow.document.images || []).filter(
    (img) => !img.complete,
  );
  if (pendingImgs.length === 0) {
    setTimeout(triggerPrint, 250);
  } else {
    let loadedCount = 0;
    const onImgSettled = () => {
      loadedCount++;
      if (loadedCount >= pendingImgs.length) setTimeout(triggerPrint, 150);
    };
    pendingImgs.forEach((img) => {
      img.addEventListener("load", onImgSettled);
      img.addEventListener("error", onImgSettled);
    });
    setTimeout(triggerPrint, 2500);
  }
}
