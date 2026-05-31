import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-cairo",
});

export const metadata: Metadata = {
  title: "مدونة الخليل للتحرير اللغوي",
  description: "مساعدك اللغوي لسبك الأفكار، دمج المسودات، والارتقاء بالمحتوى اللغوي بكفاءة بنائية و زمنية.",
  keywords: [
    "مدونة الخليل",
    "التحرير اللغوي",
    "دمج المسودات",
    "التوجيه المخصص للكاتب",
    "التدقيق الدلالي المرن",
    "صياغة النصوص العربية",
    "المحرر الذكي",
    "الذكاء الاصطناعي العربي",
    "سبك الأفكار",
    "الهندسة اللغوية",
    "المعالجة الهجينة للنصوص"
  ],
  authors: [{ name: "Eng. Saeed Ali Alzahrani" }],
  creator: "Eng. Saeed Ali Alzahrani",
  publisher: "مدونة الخليل",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    url: "https://edit.alamalholol.com",
    title: "مدونة الخليل للتحرير اللغوي",
    description: "مساعدك اللغوي لسبك الأفكار، دمج المسودات، والارتقاء بالمحتوى اللغوي بكفاءة بنائية و زمنية.",
    siteName: "مدونة الخليل للتحرير اللغوي",
  },
  twitter: {
    card: "summary_large_image",
    title: "مدونة الخليل للتحرير اللغوي",
    description: "مساعدك اللغوي لسبك الأفكار، دمج المسودات، والارتقاء بالمحتوى اللغوي بكفاءة بنائية و زمنية.",
  },
};

const themeInitScript = `(function(){try{var k="${THEME_STORAGE_KEY}";var t=localStorage.getItem(k);var d="${DEFAULT_THEME}";if(t!=="oatmeal"&&t!=="sovereign-dark")t=d;document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t==="oatmeal"?"light":"dark";}catch(e){document.documentElement.setAttribute("data-theme","${DEFAULT_THEME}");}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
