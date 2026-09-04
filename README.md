# ✦ Gemini Studio Toolkit

<div align="center">

![Gemini Studio Toolkit Banner](assets/icon.png)

### **Bộ công cụ sáng tạo đa năng 4-trong-1: Xóa Watermark AI, Chèn Logo Thương Hiệu, Xóa Phông AI & Chuyển Đổi Media / Tài Liệu Word sang PDF**

[![Version](https://img.shields.io/badge/version-1.0.0-6366f1.svg?style=for-the-badge)](https://github.com/haihoan2874/Gemini-Studio-Toolkit)
[![Node.js](https://img.shields.io/badge/Node.js-18+-22c55e.svg?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-36.4.0-475569.svg?style=for-the-badge&logo=electron)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-0284c7.svg?style=for-the-badge&logo=windows)](https://microsoft.com/windows)
[![Offline](https://img.shields.io/badge/Engine-100%25%20Offline%20Local-8b5cf6.svg?style=for-the-badge)](https://github.com/haihoan2874/Gemini-Studio-Toolkit)
[![License](https://img.shields.io/badge/License-MIT-amber.svg?style=for-the-badge)](LICENSE)

**Tác giả & Nhà phát triển chính:** [TRỊNH HẢI HOÀN](https://github.com/haihoan2874)

---

</div>

## 📖 Giới thiệu tổng quan

**Gemini Studio Toolkit** (tiền thân là *Gemini Watermark Remover*) là bộ ứng dụng Desktop chuyên nghiệp all-in-one dành cho các nhà sáng tạo nội dung, biên tập viên hình ảnh/video, văn phòng và lập trình viên. 

Ứng dụng quy tụ **4 phân hệ công nghệ mạnh mẽ** trong một giao diện Dark-tech hiện đại:
1. **Xóa Watermark Gemini AI** trên cả Ảnh & Video.
2. **Chèn Logo Thương Hiệu** tương tác đa điểm (Canvas kéo thả trực tiếp, Snap to Gemini, 9 neo tọa độ).
3. **Xóa Phông Nền AI Đa Dụng** (On-Device Neural Network AI Background Removal) tách nền chuẩn xác từng sợi tóc.
4. **Chuyển Đổi Định Dạng Toàn Năng (Universal Converter)**: Chuyển đổi Word (.docx/.doc) sang PDF nguyên gốc 100% dàn trang; Chuyển đổi định dạng Video, Audio và GIF chất lượng cao.

> 🔒 **100% Bảo Mật & Hoạt Động Hoàn Toàn Offline:** Mọi tác vụ xử lý hình ảnh, video, mô hình AI và tài liệu đều diễn ra trực tiếp trên phần cứng máy tính cá nhân của bạn. Không có bất kỳ dữ liệu nào bị gửi lên đám mây hoặc máy chủ bên thứ ba.

---

## ✨ 4 Trụ Cột Tính Năng Chi Tiết

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GEMINI STUDIO TOOLKIT                           │
├───────────────────┬───────────────────┬───────────────────┬────────────┤
│  1. XÓA WATERMARK │   2. CHÈN LOGO    │   3. XÓA PHÔNG AI │4. CONVERTER│
│  Ảnh & Video AI   │   Canvas Tương Tác│   On-Device AI    │ Media & Doc│
└───────────────────┴───────────────────┴───────────────────┴────────────┘
```

### 1. ✦ Xóa Watermark Gemini AI (Smart AI Watermark Remover)
- **Tự động nhận diện chuẩn xác:** Tự động định vị biểu tượng hoa thị ✦ watermark Gemini trên mọi kích thước ảnh và độ phân giải video.
- **Khung nhận diện phát sáng động:** Hiển thị viền highlight nhận diện thông minh ngay khi nạp file để người dùng dễ dàng theo dõi.
- **Thuật toán Inpainting cao cấp:** Khôi phục cấu trúc pixel nền gốc mượt mà, không để lại vệt mờ, không làm giảm độ phân giải của tác phẩm.
- **Xử lý Video từng khung hình:** Tích hợp bộ giải mã WebCodecs và FFmpeg tối ưu, xử lý video MP4, WebM mượt mà, đồng bộ âm thanh chuẩn xác.

---

### 2. 🏷️ Chèn Logo Thương Hiệu (Brand Watermarker & Overlay)
- **Kéo thả chuột tự do (Interactive Drag Canvas):** Bấm giữ và kéo thả trực tiếp logo trên màn hình xem trước để đặt vào bất kỳ vị trí nào bạn muốn.
- **Bắt dính vị trí Gemini (Snap to Gemini):** Một chạm để đưa logo đè chính xác lên vị trí icon Gemini vừa xóa.
- **Hệ thống 9 điểm neo Studio:** Căn chỉnh nhanh vào 4 góc, 4 cạnh hoặc chính giữa tâm ảnh/video.
- **Tùy biến chuyên sâu:** Thanh trượt điều chỉnh Tỉ lệ kích thước (Scale 10% - 300%) và Độ mờ đục (Opacity 10% - 100%) phong cách Linear/Apple với đèn báo thông số thực tế.
- **Ghi nhớ cấu hình:** Tự động lưu logo và thiết lập yêu thích vào bộ nhớ cục bộ để sử dụng liên tục không cần nạp lại.

---

### 3. ✂️ Xóa Phông Nền AI Đa Năng (On-Device AI Background Removal)
- **Mô hình Trí Tuệ Nhân Tạo On-Device:** Ứng dụng mô hình mạng nơ-ron học sâu (Deep Learning Neural Network) chạy nội bộ bằng `@imgly/background-removal-node` và `sharp`.
- **Tách biên siêu nét:** Nhận diện người, thú cưng, xe cộ, đồ vật và sản phẩm thương mại điện tử với độ tách biên mịn màng, chuẩn xác từng sợi tóc.
- **Đa dạng chế độ màu nền:**
  - **Nền trong suốt (Transparent PNG):** Thích hợp làm sticker, thiết kế đồ họa, mockup.
  - **Nền trắng Studio (Pure White #FFFFFF):** Chuẩn ảnh sản phẩm Shopee, Lazada, Amazon.
  - **Nền xanh ảnh thẻ (#2B579A):** Chuẩn ảnh hồ sơ, passport, CCCD.
  - **Màu tùy chọn tự do:** Bảng chọn màu Hex/RGB Color Picker phong phú.
- **Xử lý hàng loạt siêu tốc:** Nạp cùng lúc hàng chục ảnh chân dung hoặc sản phẩm, tách phông tự động và tải về thư mục chỉ với 1 click.

---

### 4. 🔄 Chuyển Đổi Định Dạng Media & Tài Liệu (Universal Studio Converter)
- **Word (.docx, .doc) sang PDF hoàn hảo:**
  - Sử dụng **Word COM Native Engine** trực tiếp từ hệ điều hành Windows.
  - Bảo đảm **100% chuẩn font tiếng Việt có dấu**, không xô lệch bảng biểu, giữ nguyên header/footer, công thức toán học và chất lượng in ấn vector.
- **Chuyển đổi Video đa năng:** Chuyển đổi qua lại giữa MP4, WebM, AVI, MOV, MKV với tùy chọn độ phân giải (1080p, 720p, 480p), tốc độ khung hình (60 FPS, 30 FPS, 24 FPS) và hệ số nén CRF.
- **Bộ lọc & Chuyển đổi Âm thanh:** Trích xuất âm thanh từ video hoặc nén nhạc MP3, WAV, AAC, M4A, FLAC với bitrate phòng thu (320kbps, 192kbps, 128kbps).
- **Tạo ảnh động GIF tối ưu:** Chuyển video clip thành GIF với thuật toán khử răng cưa và tùy chọn scale chiều rộng, frame rate nhẹ nhàng để chia sẻ mạng xã hội.
- **Bảng điều khiển Hàng đợi Thời gian thực (Queue Dashboard):** Đo lường số lượng file, tiến độ %, tốc độ xử lý và thông báo trực quan.

---

## 🎨 Trải Nghiệm Giao Diện Người Dùng (UI/UX) Đỉnh Cao

- **Thanh trượt vuốt so sánh Trước / Sau (Interactive Wipe Slider):** Kéo vuốt thanh trượt trực tiếp trên ảnh để so sánh kết quả xử lý với ảnh gốc cực kỳ mãn nhãn.
- **Thumbnail thu nhỏ trực quan trong hàng đợi:** Xem nhanh ảnh đại diện của từng file trong danh sách đợi xử lý.
- **Dán nhanh từ Clipboard (`Ctrl + V`):** Chụp màn hình hoặc copy ảnh từ trình duyệt/chat và ấn `Ctrl + V` để nạp ngay vào tab đang mở.
- **Ngôn ngữ thiết kế S-Life Techwear:** Phối màu Obsidian `#080c14` và Slate sang trọng, các nút bấm viền mỏng cao cấp, phông chữ Inter thẳng đứng hiện đại, chuẩn tương phản WCAG AA bảo vệ thị giác.

---

## 💻 Yêu Cầu Hệ Thống

| Thành phần | Yêu cầu tối thiểu | Khuyến nghị |
| :--- | :--- | :--- |
| **Hệ điều hành** | Windows 10 / 11 64-bit | Windows 11 64-bit (Update mới nhất) |
| **Bộ xử lý (CPU)** | Intel Core i3 / AMD Ryzen 3 | Intel Core i5 / AMD Ryzen 5 trở lên |
| **Bộ nhớ (RAM)** | 4 GB RAM | 8 GB RAM trở lên |
| **Dung lượng đĩa** | 500 MB trống | 1 GB SSD trống |
| **Phụ trợ Word → PDF** | Microsoft Office Word installed | Office 2016 / 2019 / 2021 / 365 |

---

## 🚀 Hướng Dẫn Cài Đặt & Sử Dụng

### 1. Dành cho Người dùng (Bản Portable - Dùng ngay không cần cài đặt)

1. Tải bản dựng mới nhất tại mục [**Releases**](https://github.com/haihoan2874/Gemini-Studio-Toolkit/releases).
2. Giải nén file zip tải về vào một thư mục bất kỳ trên máy tính.
3. Click đúp chuột vào file thực thi `Gemini Studio Toolkit.exe` để khởi động ứng dụng ngay lập tức.
4. Thả file ảnh, video hoặc tài liệu vào giao diện và trải nghiệm!

---

### 2. Dành cho Lập trình viên (Chạy & Đóng gói từ Mã nguồn)

#### Bước 1: Clone kho lưu trữ
```bash
git clone https://github.com/haihoan2874/Gemini-Studio-Toolkit.git
cd Gemini-Studio-Toolkit
```

#### Bước 2: Cài đặt các gói phụ thuộc
```bash
npm install
```

#### Bước 3: Khởi chạy môi trường phát triển (Development)
```bash
npm run dev
```

#### Bước 4: Đóng gói thành bản Portable .EXE độc lập
```bash
npm run build
```
*Gói sản phẩm `.exe` hoàn chỉnh sẽ nằm trong thư mục `dist/Gemini Studio Toolkit-win32-x64`.*

---

## ⚙️ Hướng Dẫn Đổi Tên Repo Trên GitHub (Dành cho Chủ sở hữu)

Để đồng bộ hoàn toàn tên Repository trên GitHub của bạn thành `Gemini-Studio-Toolkit`:

1. Truy cập vào trang quản trị repo: [https://github.com/haihoan2874/Gemini-Watermark-Remove/settings](https://github.com/haihoan2874/Gemini-Watermark-Remove/settings).
2. Tại mục **General** > **Repository name**, nhập:
   ```
   Gemini-Studio-Toolkit
   ```
3. Nhấn **Rename** để xác nhận. *(GitHub sẽ tự động thiết lập chuyển hướng từ link cũ sang link mới).*
4. Trên máy tính, cập nhật đường dẫn git remote:
   ```bash
   git remote set-url origin https://github.com/haihoan2874/Gemini-Studio-Toolkit.git
   ```

---

## 🛠️ Công Nghệ Nền Tảng

- **Runtime & Desktop Framework:** [Electron.js](https://www.electronjs.org/) (v36+)
- **Đồ họa & Xử lý Pixel:** [Sharp](https://sharp.pixelplumbing.com/) & Canvas API
- **AI Neural Network Engine:** [@imgly/background-removal-node](https://github.com/imgly/background-removal-js) & [@xenova/transformers](https://huggingface.co/docs/transformers.js)
- **Multimedia Processing:** [FFmpeg](https://ffmpeg.org/) via `@ffmpeg-installer/ffmpeg`
- **Document Conversion:** Windows Word Native Component Object Model (COM Automation)
- **Design System:** S-Life Techwear UI (Vanilla CSS Grid/Flexbox, Zero-bloat, 60fps animations)

---

## 👤 Tác Giả & Giấy Phép

- Toàn bộ sản phẩm được phát triển, tối ưu hóa và bảo trì bởi: **TRỊNH HẢI HOÀN**
- GitHub: [@haihoan2874](https://github.com/haihoan2874)
- Giấy phép phân phối: [MIT License](LICENSE). Bạn hoàn toàn được phép sử dụng cho mục đích cá nhân và thương mại.

<div align="center">
  <sub>Phát triển với tất cả tâm huyết vì cộng đồng sáng tạo · Made by Trịnh Hải Hoàn</sub>
</div>
