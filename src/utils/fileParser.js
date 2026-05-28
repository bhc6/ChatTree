/**
 * Utility to parse and extract text/base64 from various files client-side
 */

const loadedScripts = new Map();

export const loadScript = (src) => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Browser environment required"));
  }
  if (loadedScripts.has(src)) {
    return loadedScripts.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
  });

  loadedScripts.set(src, promise);
  return promise;
};

const getBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

const parsePdf = async (file) => {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    text += `--- Page ${i} ---\n${pageText}\n\n`;
  }
  return text;
};

const parseDocx = async (file) => {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js");
  const mammoth = window.mammoth;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

const parseXlsx = async (file) => {
  await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  const XLSX = window.XLSX;
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  let text = "";
  workbook.SheetNames.forEach((sheetName) => {
    text += `--- Sheet: ${sheetName} ---\n`;
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    text += csv + "\n\n";
  });
  return text;
};

export const parseFile = async (file) => {
  const isImage = file.type.startsWith("image/");
  const isText = file.type.startsWith("text/") || /\.(txt|md|json|js|jsx|ts|tsx|py|html|css|csv|xml|yaml|yml|sh|ini|conf)$/i.test(file.name);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(file.name);
  const isXlsx = file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.type === "application/vnd.ms-excel" || /\.(xlsx|xls)$/i.test(file.name);

  // Generate base64 dataUrl for all files
  const dataUrl = await getBase64(file);
  let textContent = "";

  if (isImage) {
    // Images don't have text content
  } else if (isText) {
    textContent = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  } else if (isPdf) {
    textContent = await parsePdf(file);
  } else if (isDocx) {
    textContent = await parseDocx(file);
  } else if (isXlsx) {
    textContent = await parseXlsx(file);
  } else {
    textContent = "Binary file (not parsed client-side)";
  }

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl,
    textContent,
  };
};
