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
2. Trên Droplet, cài Node.js 22, đưa mã nguồn đến `/opt/scenes`, tạo user `scenes`, rồi tạo `/etc/scenes/api.env` theo `server/.env.example`. Đặt `WEB_ORIGIN=https://TEN_USER.github.io` (không có đường dẫn repository), `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN` và mật khẩu dài. Giới hạn quyền đọc file cấu hình cho root; cho systemd đọc qua `EnvironmentFile`. Xem lệnh chi tiết bên dưới.
3. Sao chép `deploy/film-api.service.example` thành `/etc/systemd/system/film-api.service`, sau đó chạy `sudo systemctl daemon-reload`, `sudo systemctl enable --now film-api` và xem log bằng `sudo journalctl -u film-api -f`. Nếu Node không nằm ở `/usr/bin/node`, sửa `ExecStart` cho đúng.
4. Trỏ bản ghi DNS `A` của `api.example.com` về IP Droplet và mở cổng 80, 443 trên firewall. Trên Ubuntu/Debian, cài Nginx và dùng cấu hình `deploy/nginx-api.conf.example` theo các lệnh bên dưới. Cấu hình này chuyển `/api/` đến API chỉ nghe ở `127.0.0.1:3001`.
5. Cài [Certbot cho Nginx](https://certbot.eff.org/instructions?os=snap&ws=nginx), rồi chạy `sudo certbot --nginx -d api.example.com --redirect` để cấp chứng chỉ HTTPS và chuyển HTTP sang HTTPS. Kiểm tra gia hạn bằng `sudo certbot renew --dry-run`. Certbot sẽ chỉnh file Nginx đã cài trên Droplet; không chép đè file đó bằng bản mẫu sau khi cấp chứng chỉ.
6. Trong repository GitHub, đặt **Actions variable** `VITE_API_URL=https://api.example.com`. Vào **Settings → Pages → Build and deployment**, chọn **GitHub Actions**. Workflow `.github/workflows/pages.yml` sẽ build và xuất bản website mỗi khi có commit mới, kể cả commit cập nhật phim. Với project Pages, workflow đặt `VITE_BASE_PATH` theo tên repository; nếu dùng domain riêng cho website, đổi giá trị này thành `/`.

### Chi tiết bước 2 trên Ubuntu/Debian

Sau khi project đã được đưa lên GitHub ở bước 1, từ PowerShell SSH vào Droplet (`root` là ví dụ; dùng user SSH của bạn nếu khác):

```sh
ssh root@IP_DROPLET
```

Các lệnh tiếp theo chạy **trên Droplet**. Cài công cụ cần thiết:

```sh
sudo apt update
sudo apt install -y curl git
```

Nếu `node -v` chưa là `v22.x`, cài [gói NodeSource cho Node.js 22](https://github.com/nodesource/distributions/blob/master/DEV_README.md):

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt install -y nodejs
node -v
command -v node
```

Tạo user chạy API và lấy mã nguồn. Lệnh `git clone` dưới đây dành cho repository public và chỉ chạy khi `/opt/scenes` chưa tồn tại:

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin scenes
sudo git clone https://github.com/TEN_USER/TEN_REPOSITORY.git /opt/scenes
ls -l /opt/scenes/server/index.mjs
```

Nếu repository private, cấu hình SSH deploy key trước khi clone. Thay `TEN_USER` và `TEN_REPOSITORY` bằng địa chỉ repository thật. Nếu user `scenes` đã tồn tại thì không tạo lại. API chỉ dùng các module có sẵn của Node.js nên không cần `npm ci` trên Droplet; frontend được build bằng GitHub Actions.

Tạo file cấu hình **trên Droplet** (không sao chép file `server/.env` ở máy cá nhân lên GitHub):

```sh
sudo mkdir -p /etc/scenes
sudo nano /etc/scenes/api.env
```

Nhập các dòng sau trong `nano`, thay giá trị ví dụ bằng của bạn. `ADMIN_PASSWORD` là mật khẩu đăng nhập website, dài ít nhất 16 ký tự; đây không phải mật khẩu GitHub.

```dotenv
PORT=3001
WEB_ORIGIN=https://TEN_USER.github.io
GITHUB_OWNER=TEN_USER
GITHUB_REPO=TEN_REPOSITORY
GITHUB_BRANCH=main
GITHUB_FILE_PATH=public/films.json
GITHUB_TOKEN=TOKEN_GITHUB_CUA_BAN
ADMIN_PASSWORD=MAT_KHAU_QUAN_TRI_CUA_BAN
```

Lưu bằng `Ctrl+O`, `Enter`, `Ctrl+X`, rồi giới hạn quyền đọc và xác nhận đường dẫn Node:

```sh
sudo chown root:root /etc/scenes/api.env
sudo chmod 600 /etc/scenes/api.env
sudo stat -c '%U:%G %a %n' /etc/scenes/api.env
command -v node
```

Kết quả `stat` cần là `root:root 600`; `command -v node` nên là `/usr/bin/node` để khớp file service ở bước 3. Nếu website có domain riêng, đặt `WEB_ORIGIN` bằng origin của domain đó. Bước 2 chỉ chuẩn bị API; bước 3 mới chạy service.

### Chi tiết bước 3: chạy API bằng systemd

Trên Droplet, xác nhận các file của bước 2 đã có. Không in nội dung `/etc/scenes/api.env` ra terminal vì file này chứa token:

```sh
ls -l /opt/scenes/server/index.mjs
id scenes
command -v node
sudo stat -c '%U:%G %a %n' /etc/scenes/api.env
```

Cài service từ file mẫu:

```sh
sudo cp /opt/scenes/deploy/film-api.service.example /etc/systemd/system/film-api.service
```

Nếu `command -v node` không trả về `/usr/bin/node`, dùng `sudo nano /etc/systemd/system/film-api.service` để sửa đường dẫn đầu tiên trong `ExecStart` cho đúng. Sau đó bật và khởi chạy service:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now film-api
sudo systemctl status film-api --no-pager
```

Trạng thái cần là `active (running)`. Service chạy dưới user `scenes`, đọc biến cấu hình từ `/etc/scenes/api.env`, và chỉ nghe trên `127.0.0.1:3001`. Kiểm tra API ngay trên Droplet bằng yêu cầu GET:

```sh
curl -i http://127.0.0.1:3001/api/films
```

Kết quả đúng là HTTP `200` với JSON chứa `films` và `sha` (khi chưa có phim, `films` là `[]`). Nếu service không chạy hoặc API trả lỗi, xem log:

```sh
sudo journalctl -u film-api -n 50 --no-pager
```

Nếu log báo thiếu biến cấu hình, kiểm tra `/etc/scenes/api.env`; nếu báo `GitHub read failed`, kiểm tra `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_FILE_PATH` và quyền token. Sau khi sửa file env, chạy `sudo systemctl restart film-api`. Chỉ sau khi bước này trả HTTP `200` mới tiếp tục cấu hình Nginx ở bước 4.

Lệnh cài Nginx và Certbot trên Ubuntu/Debian (chạy các lệnh sao chép và tạo liên kết một lần khi cấu hình mới):

```sh
sudo apt update
sudo apt install nginx snapd
sudo systemctl enable --now nginx
sudo cp /opt/scenes/deploy/nginx-api.conf.example /etc/nginx/sites-available/scenes-api
sudo nano /etc/nginx/sites-available/scenes-api
sudo ln -s /etc/nginx/sites-available/scenes-api /etc/nginx/sites-enabled/scenes-api
sudo nginx -t
sudo systemctl reload nginx
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d api.example.com --redirect
sudo certbot renew --dry-run
curl -i https://api.example.com/api/films
```

Trong `nano`, thay `server_name api.example.com` bằng domain API thật. Thay domain trong lệnh Certbot và `curl` tương ứng. Certbot quản lý phần HTTPS trong cấu hình Nginx trên Droplet; sau đó không chép lại file mẫu lên file đã được Certbot chỉnh.

Khi cập nhật mã API trên Droplet, đồng bộ mã nguồn và chạy `sudo systemctl restart film-api`. Website vẫn đọc dữ liệu mới trực tiếp qua API ngay sau khi lưu; Pages sẽ build lại từ commit mới.

## Dữ liệu cũ trong trình duyệt

Sau khi đăng nhập, nếu repository chưa có phim và trình duyệt đang có dữ liệu `localStorage` cũ, ứng dụng hiện nút **Nhập vào dữ liệu chung**. Dữ liệu cũ chỉ bị xóa khỏi `localStorage` sau khi API lưu thành công lên GitHub. Hãy thực hiện trên đúng trình duyệt đã lưu phim trước đây.

## Kiểm tra

```sh
npm run lint
npm run test
npm run build
```
