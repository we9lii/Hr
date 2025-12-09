import { GoogleGenAI } from "@google/genai";
import { AttendanceRecord, DashboardStats } from "../types";

const getClient = () => {
    if (!process.env.API_KEY) {
        throw new Error("API Key not found");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Helper to prepare a data summary for the AI
const prepareDataContext = (records: AttendanceRecord[], stats: DashboardStats | null) => {
    // 1. Basic Stats
    let context = `
    بيانات الحضور والإنصراف الحالية:
    - إجمالي الموظفين: ${stats?.totalEmployees || 0}
    - الحضور اليوم: ${stats?.presentToday || 0}
    - عدد المتأخرين اليوم: ${stats?.lateToday || 0}
    - الغياب/إجازة: ${stats?.onLeave || 0}
    `;

    // 2. Calculate Monthly Delays & Absences (Simple Logic for Context)
    const currentMonth = new Date().getMonth();
    const empStats = new Map<string, {name: string, lateMinutes: number, lateCount: number}>();

    records.forEach(r => {
        const d = new Date(r.timestamp);
        if (d.getMonth() === currentMonth && r.type === 'CHECK_IN') {
             if (!empStats.has(r.employeeId)) {
                 empStats.set(r.employeeId, { name: r.employeeName, lateMinutes: 0, lateCount: 0 });
             }
             const emp = empStats.get(r.employeeId)!;
             
             // Calculate delay (after 8:00 AM)
             const checkInTime = new Date(r.timestamp);
             const targetTime = new Date(r.timestamp);
             targetTime.setHours(8, 0, 0, 0);
             
             if (checkInTime > targetTime) {
                 const diff = Math.floor((checkInTime.getTime() - targetTime.getTime()) / 60000);
                 emp.lateMinutes += diff;
                 emp.lateCount += 1;
             }
        }
    });

    context += `\n
    ملخص أداء الموظفين للشهر الحالي (تأخيرات):
    `;
    
    empStats.forEach((val) => {
        if (val.lateCount > 0) {
            context += `- ${val.name}: تأخر ${val.lateCount} مرات (إجمالي ${val.lateMinutes} دقيقة).\n`;
        }
    });

    // 3. Add recent raw logs for context
    const recentLogs = records.slice(0, 15).map(r => 
        `[${new Date(r.timestamp).toLocaleTimeString()}] ${r.employeeName} - ${r.type} (${r.status})`
    ).join('\n');

    context += `\n
    آخر الحركات المسجلة:
    ${recentLogs}
    `;

    return context;
};

// Main Analysis Function (Dashboard Overview)
export const analyzeAttendancePatterns = async (records: AttendanceRecord[], stats: DashboardStats | null): Promise<string> => {
  try {
    const ai = getClient();
    const dataContext = prepareDataContext(records, stats);

    const prompt = `
      بصفتك مستشار موارد بشرية ومدير نظام الحضور، قم بتحليل البيانات التالية بدقة واختصار.
      
      المطلوب منك في التقرير:
      1. تحليل وضع اليوم (الحضور، الغياب، التأخير).
      2. تحليل شهري لساعات التأخير والغياب (من الموظف الأكثر انضباطاً ومن الأقل).
      3. تقديم نصيحة إدارية واحدة بناءً على البيانات.

      البيانات:
      ${dataContext}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "لم يتم استلام رد.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "عذراً، يرجى التأكد من إعداد مفتاح API الخاص بـ Gemini.";
  }
};

// Custom Query Function (User asks a specific question)
export const askAI = async (query: string, records: AttendanceRecord[], stats: DashboardStats | null): Promise<string> => {
    try {
        const ai = getClient();
        const dataContext = prepareDataContext(records, stats);

        const prompt = `
          أنت مساعد ذكي لمدير الموارد البشرية. لديك البيانات التالية عن الحضور والإنصراف.
          أجب على سؤال المدير بناءً *فقط* على هذه البيانات.

          البيانات:
          ${dataContext}

          سؤال المدير:
          "${query}"
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
      
        return response.text || "لم يتم استلام رد.";
    } catch (error) {
        console.error("Gemini Query Error:", error);
        return "حدث خطأ أثناء معالجة طلبك.";
    }
};