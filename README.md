# Gemini Watermark Remover

Gemini Watermark Remover là một ứng dụng Desktop mạnh mẽ, được thiết kế và phát triển bởi **TRỊNH HẢI HOÀN**, giúp bạn dễ dàng xóa bỏ watermark (dấu bản quyền) trên các bức ảnh được tạo ra bởi AI Gemini. 

Phần mềm hoạt động hoàn toàn Offline trên máy tính cá nhân của bạn, đảm bảo tính riêng tư tuyệt đối cho dữ liệu.

## Tính năng chính

- **Xóa Watermark thông minh:** Tự động phát hiện và xóa biểu tượng watermark của Gemini một cách hoàn hảo trên cả Ảnh và Video mà không làm hỏng cấu trúc file gốc.
- **Khung nhận diện Watermark trực quan:** Đánh dấu vị trí watermark Gemini bằng khung viền phát sáng động ngay khi tải file lên để người dùng theo dõi trực quan.
- **Tab Chèn Logo thương hiệu độc lập:** Đè trực tiếp logo thương hiệu lên đúng vị trí icon mờ Gemini (hoặc 9 vị trí tùy chọn, kéo thả chuột trực tiếp trên khung xem trước) bằng công nghệ FFmpeg siêu tốc cho video.
- **Xử lý hàng loạt (Batch Processing):** Hỗ trợ kéo thả và xử lý cùng lúc hàng chục video / ảnh cho cả Tab Xóa Watermark và Tab Chèn Logo; hỗ trợ xuất toàn bộ danh sách ra thư mục chỉ với 1 click.
- **Dán nhanh từ Clipboard (`Ctrl + V`):** Nhận diện ảnh chụp màn hình và ảnh copy từ clipboard để nạp ngay vào ứng dụng mà không cần lưu file trung gian.
- **Bảo mật tuyệt đối (100% Local):** Mọi quá trình xử lý đều diễn ra cục bộ trên máy tính của bạn với FFmpeg tích hợp sẵn. Ứng dụng không bao giờ tải ảnh/video lên bất kỳ máy chủ nào.
- **Xem trước và so sánh trực quan:** Split view, Before/After view đồng bộ trình phát video song song giữa bản gốc và bản đã xử lý.
- **Giao diện hiện đại & Dark Mode:** Thiết kế chuẩn S-Life Techwear, tông Slate/Primary sang trọng, mượt mà và tối ưu hóa trải nghiệm.
- **Hỗ trợ đa định dạng:** Xử lý tốt PNG, JPG, JPEG, WebP, MP4, WebM, MOV.

## Hướng dẫn cài đặt và sử dụng

### Dành cho Người dùng (Bản Portable - Không cần cài đặt)

1. Tải xuống file `Gemini_Watermark_Remover_Portable.zip` từ mục Release của Github.
2. Giải nén toàn bộ thư mục ra máy tính.
3. Click đúp chuột vào file `Gemini Watermark Remover.exe` để chạy ứng dụng ngay lập tức.
4. Kéo thả ảnh cần xử lý vào giao diện ứng dụng.
5. Nhấn "Xử lý tất cả" và chọn một thư mục bất kỳ trên máy tính để lưu tất cả các ảnh đã được làm sạch.

### Dành cho Nhà phát triển (Build từ Source Code)

Nếu bạn muốn tùy biến hoặc tự đóng gói ứng dụng từ mã nguồn, hãy làm theo các bước sau:

**Yêu cầu hệ thống:**
- Đã cài đặt [Node.js](https://nodejs.org/) (phiên bản 18 trở lên).

**Các bước thực hiện:**

1. Clone kho lưu trữ này về máy tính của bạn:
   ```bash
   git clone https://github.com/haihoan2874/Gemini-Watermark-Remove.git
   cd Gemini-Watermark-Remove
   ```

2. Cài đặt các thư viện phụ thuộc:
   ```bash
   npm install
   ```

3. Chạy ứng dụng trong môi trường thử nghiệm (Development):
   ```bash
   npm run start
   ```

4. Đóng gói ứng dụng (Build ra file .exe độc lập):
   ```bash
   npm run build
   ```
   *File thực thi `.exe` sẽ được tự động tạo ra bên trong thư mục `dist`.*

## Công nghệ sử dụng

- **Electron.js:** Khung phát triển ứng dụng Desktop đa nền tảng.
- **HTML/CSS/JS thuần:** Giúp giao diện ứng dụng mượt mà, siêu nhẹ và nhanh chóng.
- **@pilio/gemini-watermark-remover:** Thư viện thuật toán lõi chuyên biệt để xử lý cấu trúc ảnh.

## Tác giả và Bản quyền

Sản phẩm được phát triển và tối ưu hóa bởi **TRỊNH HẢI HOÀN**.
Mọi góp ý hoặc báo lỗi, vui lòng tạo Issue trên kho lưu trữ GitHub này.
