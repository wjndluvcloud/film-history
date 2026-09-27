# Scenes

Nhật ký phim viết bằng React, TypeScript và Vite. Website tĩnh chạy trên GitHub Pages; API chạy trên DigitalOcean Droplet; dữ liệu chung nằm trong `public/films.json` của repository. Khách xem được phim, chỉ chủ sở hữu đăng nhập mới thêm hoặc sửa được.

## Chạy trên máy cá nhân

Cần Node.js 22. Tạo `.env` từ `.env.example` và `server/.env` từ `server/.env.example`, rồi điền thông tin GitHub và mật khẩu. Token GitHub chỉ đặt trong `server/.env`, tuyệt đối không đặt trong biến `VITE_*`.

```sh
npm ci
npm run api
npm run dev
```

Chạy hai lệnh cuối trong hai terminal. Trên Windows PowerShell, dùng `npm.cmd` nếu `npm.ps1` bị chặn. Mặc định frontend ở `http://localhost:5173`, API ở `http://localhost:3001`; `WEB_ORIGIN` phải khớp chính xác origin của frontend.

## Triển khai

1. Đưa project lên repository GitHub với nhánh `main`. Nhánh này cần cho phép token tạo commit trực tiếp. Tạo [fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) chỉ cho repository này, với quyền **Contents: Read and write**. API dùng token đó để ghi `public/films.json` bằng [Contents API](https://docs.github.com/en/rest/repos/contents). Không commit token hoặc mật khẩu.
2. Trên Droplet, cài Node.js 22 và Caddy, đưa mã nguồn đến `/opt/scenes`, tạo user `scenes`, rồi tạo `/etc/scenes/api.env` theo `server/.env.example`. Đặt `WEB_ORIGIN=https://TEN_USER.github.io` (không có đường dẫn repository), `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN` và mật khẩu dài. Giới hạn quyền đọc file cấu hình cho root; cho systemd đọc qua `EnvironmentFile`.
3. Sao chép `deploy/film-api.service.example` thành `/etc/systemd/system/film-api.service`, sau đó chạy `sudo systemctl daemon-reload`, `sudo systemctl enable --now film-api` và xem log bằng `sudo journalctl -u film-api -f`. Nếu Node không nằm ở `/usr/bin/node`, sửa `ExecStart` cho đúng.
4. Trỏ DNS `api.example.com` về IP Droplet. Thay domain trong `deploy/Caddyfile.example`, đưa nội dung vào `/etc/caddy/Caddyfile` rồi chạy `sudo systemctl reload caddy`. Caddy chuyển HTTPS đến API chỉ nghe ở `127.0.0.1:3001`.
5. Trong repository GitHub, đặt **Actions variable** `VITE_API_URL=https://api.example.com`. Vào **Settings → Pages → Build and deployment**, chọn **GitHub Actions**. Workflow `.github/workflows/pages.yml` sẽ build và xuất bản website mỗi khi có commit mới, kể cả commit cập nhật phim. Với project Pages, workflow đặt `VITE_BASE_PATH` theo tên repository; nếu dùng domain riêng cho website, đổi giá trị này thành `/`.

Khi cập nhật mã API trên Droplet, đồng bộ mã nguồn và chạy `sudo systemctl restart film-api`. Website vẫn đọc dữ liệu mới trực tiếp qua API ngay sau khi lưu; Pages sẽ build lại từ commit mới.

## Dữ liệu cũ trong trình duyệt

Sau khi đăng nhập, nếu repository chưa có phim và trình duyệt đang có dữ liệu `localStorage` cũ, ứng dụng hiện nút **Nhập vào dữ liệu chung**. Dữ liệu cũ chỉ bị xóa khỏi `localStorage` sau khi API lưu thành công lên GitHub. Hãy thực hiện trên đúng trình duyệt đã lưu phim trước đây.

## Kiểm tra

```sh
npm run lint
npm run test
npm run build
```
