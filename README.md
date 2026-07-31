# Gemini Watermark Remover

Gemini Watermark Remover là một ứng dụng Desktop mạnh mẽ, được thiết kế và phát triển bởi **TRỊNH HẢI HOÀN**, giúp bạn dễ dàng xóa bỏ watermark (dấu bản quyền) trên các bức ảnh được tạo ra bởi AI Gemini. 

Phần mềm hoạt động hoàn toàn Offline trên máy tính cá nhân của bạn, đảm bảo tính riêng tư tuyệt đối cho dữ liệu.

## Tính năng chính

- **Xóa Watermark thông minh:** Tự động phát hiện và xóa biểu tượng watermark của Gemini một cách hoàn hảo mà không làm hỏng cấu trúc ảnh gốc.
- **Xử lý hàng loạt (Batch Processing):** Hỗ trợ kéo thả và xử lý cùng lúc hàng chục bức ảnh, giúp tiết kiệm tối đa thời gian.
- **Bảo mật tuyệt đối (100% Local):** Mọi quá trình xử lý đều diễn ra cục bộ trên máy tính của bạn. Ứng dụng không bao giờ tải ảnh lên bất kỳ máy chủ lưu trữ nào.
- **Xem trước trực quan:** Tính năng so sánh ảnh trước và sau khi xử lý (Before/After) giúp bạn dễ dàng kiểm tra chất lượng của từng bức ảnh.
- **Giao diện hiện đại:** Thiết kế tối giản, chế độ ban đêm (Dark Mode) chuyên nghiệp và tối ưu trải nghiệm người dùng.
- **Hỗ trợ đa định dạng:** Xử lý tốt các định dạng ảnh phổ biến như PNG, JPG, JPEG, WebP.

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
