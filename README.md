# Scenes

Nhật ký phim viết bằng React, TypeScript và Vite. Website tĩnh chạy trên GitHub Pages; API chạy trên Cloudflare Workers; dữ liệu chung nằm trong `public/films.json` của repository. Khách xem được phim, chỉ chủ sở hữu đăng nhập mới thêm hoặc sửa được.

Frontend tải danh sách qua API; Worker đọc và ghi file trên GitHub. Chạy ứng dụng ở máy cá nhân cũng dùng dữ liệu của repository được cấu hình trong `server/.dev.vars`. Phiên đăng nhập và giới hạn thử mật khẩu được lưu trong Durable Objects. File `public/films.json` trong bản build không được dùng làm dữ liệu dự phòng khi API mất kết nối.

## Tính năng hiện tại

- **Tổng quan**: phim xem gần nhất, số phim đã xem, số phim xem trong tháng, điểm trung bình của các phim đã chấm và danh sách muốn xem.
- **Đã xem**, **Muốn xem**, **Bỏ lỡ**: danh sách nhóm theo tháng; phim đã xem được sắp xếp theo ngày xem mới nhất.
- Chủ sở hữu có thể thêm phim đã xem hoặc muốn xem; cập nhật ngày xem, điểm, poster và ghi chú; đánh dấu phim bỏ lỡ; đưa phim bỏ lỡ về danh sách muốn xem và chọn lại tháng dự định.
- Chọn ngày/tháng bằng lịch tiếng Việt hoặc nhập `dd/MM/yyyy` và `MM/yyyy`. Giao diện chấm điểm từ 0,5 đến 5 sao, bước 0,5; giá trị `0` là **Chưa chấm** và không được tính vào điểm trung bình.
- Nhập dữ liệu `localStorage` cũ vào GitHub khi danh sách chung đang trống.

## Chạy trên máy cá nhân

Cần Node.js 22 và npm, cùng repository GitHub chứa `public/films.json` hợp lệ. Tạo `.env` từ [.env.example](.env.example) và `server/.dev.vars` từ [server/.dev.vars.example](server/.dev.vars.example). Trên PowerShell, chạy khi chưa có các file cấu hình:

```powershell
Copy-Item .env.example .env
Copy-Item server/.dev.vars.example server/.dev.vars
```

Điền thông tin GitHub và mật khẩu quản trị trong `server/.dev.vars`. Token GitHub chỉ đặt ở phía Worker, tuyệt đối không đặt trong biến `VITE_*` vì các biến này được đưa vào mã frontend.

```sh
npm ci
npm run api
npm run dev
```

Chạy hai lệnh cuối trong hai terminal. Trên Windows PowerShell, dùng `npm.cmd` nếu `npm.ps1` bị chặn. Mặc định frontend ở `http://localhost:5173`, API ở `http://localhost:3001`; `WEB_ORIGIN` phải khớp origin của frontend.

`npm run api` chạy Worker và Durable Objects bằng Wrangler trên máy cá nhân. `server/.dev.vars` được Wrangler nạp cho môi trường local; dữ liệu phim vẫn được đọc/ghi trên repository GitHub đã cấu hình. Sau khi sửa `.env`, khởi động lại Vite; sau khi sửa `.dev.vars`, khởi động lại Wrangler.

Nếu đã có `server/.env` từ bản chạy Node/Droplet, có thể sao chép thành `server/.dev.vars` thay vì tạo từ mẫu, rồi kiểm tra các giá trị. Không chép đè `.dev.vars` đã cấu hình. Cổng local được đặt bằng `--port 3001` trong script `api`; biến `PORT` cũ không điều khiển Worker.

## Cấu hình môi trường

### Frontend: `.env`

| Biến | Giá trị mẫu / mặc định | Ý nghĩa |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3001` khi chạy local | Bắt buộc để tải/lưu dữ liệu. Là địa chỉ gốc của API, không thêm `/api`, vì frontend tự nối `/api/films`, `/api/login`, `/api/session`. |
| `VITE_BASE_PATH` | `/` | Đường dẫn gốc của frontend. Dùng `/TEN_REPOSITORY/` nếu website được phục vụ dưới đường dẫn repository. |

### Worker: local và production

Môi trường local dùng `server/.dev.vars`. Môi trường production dùng `vars` trong [server/wrangler.jsonc](server/wrangler.jsonc) cho cấu hình thường và Cloudflare Secrets cho token/mật khẩu. `.dev.vars` không được tải lên khi deploy. Xem [hướng dẫn secrets của Cloudflare](https://developers.cloudflare.com/workers/configuration/secrets/).

| Biến / binding | Bắt buộc | Ý nghĩa / mặc định |
| --- | --- | --- |
| `WEB_ORIGIN` | Có | Origin frontend được phép gọi API, ví dụ `http://localhost:5173` hoặc `https://TEN_USER.github.io`; dùng origin của domain riêng nếu có. Chỉ cấu hình một origin, không kèm đường dẫn repository. |
| `GITHUB_OWNER` | Có | Tài khoản hoặc tổ chức sở hữu repository dữ liệu. |
| `GITHUB_REPO` | Có | Tên repository dữ liệu. |
| `GITHUB_BRANCH` | Không | Nhánh đọc/ghi dữ liệu, mặc định `main`. Workflow Pages hiện chỉ tự chạy khi có push vào `main`. |
| `GITHUB_FILE_PATH` | Không | Đường dẫn file dữ liệu trong repository, mặc định `public/films.json`. File phải tồn tại trước khi chạy API. |
| `GITHUB_TOKEN` | Có | Cloudflare Secret chứa token có quyền đọc và ghi nội dung repository. |
| `ADMIN_PASSWORD` | Có | Cloudflare Secret chứa mật khẩu đăng nhập website, tối thiểu 16 ký tự. |
| `AUTH_STATE` | Có | Binding tới Durable Object `AuthState`, lưu phiên đăng nhập và số lần nhập sai trong SQLite. Wrangler tạo binding và namespace theo cấu hình `durable_objects` / `exports`. |

File Wrangler hiện trỏ tới repository `wjndluvcloud/film-history` và website production `https://films.nducvu.men`. Khi chạy local, `server/.dev.vars` dùng `WEB_ORIGIN=http://localhost:5173` để ghi đè cấu hình production. Giữ nguyên tên Worker và cấu hình `AuthState` khi cập nhật để tiếp tục dùng cùng dữ liệu phiên đăng nhập.

## Triển khai trên Cloudflare Workers

### Worker hiện tại

Worker đã được triển khai tại [https://scenes-api.film-history.workers.dev](https://scenes-api.film-history.workers.dev), với `GITHUB_TOKEN` và `ADMIN_PASSWORD` được đặt trong Cloudflare Secrets. Đã kiểm tra tải danh sách phim, đăng nhập, kiểm tra phiên, đăng xuất, CORS và từ chối ghi với SHA cũ trên URL thật. Worker hiện cho phép origin của website production [https://films.nducvu.men](https://films.nducvu.men).

Địa chỉ API cần kiểm tra là `https://scenes-api.film-history.workers.dev/api/films`. Frontend GitHub Pages dùng Actions variable `VITE_API_URL=https://scenes-api.film-history.workers.dev`. Khi chạy local, đặt `VITE_API_URL=http://localhost:3001` trong `.env`, rồi chạy `npm run api` và `npm run dev` trong hai terminal.

### 1. Chuẩn bị repository GitHub

Đưa project lên repository GitHub với nhánh `main` và file `public/films.json` hợp lệ. Nhánh này cần cho phép token tạo commit trực tiếp. Tạo [fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) chỉ cho repository này, với quyền **Contents: Read and write**. API dùng token đó để ghi dữ liệu bằng [Contents API](https://docs.github.com/en/rest/repos/contents).

### 2. Cấu hình và deploy Worker

Tạo tài khoản Cloudflare, cài dependency bằng `npm ci`, rồi sửa `vars` trong `server/wrangler.jsonc`:

```json
{
  "vars": {
    "WEB_ORIGIN": "https://TEN_USER.github.io",
    "GITHUB_OWNER": "TEN_USER",
    "GITHUB_REPO": "TEN_REPOSITORY",
    "GITHUB_BRANCH": "main",
    "GITHUB_FILE_PATH": "public/films.json"
  }
}
```

Nếu frontend dùng domain riêng, đặt `WEB_ORIGIN` bằng origin của domain đó. Token và mật khẩu được nhập riêng ở bước 3, không thêm vào `vars`. Trong terminal tại thư mục project:

```sh
npx wrangler login
npm run api:check
npm run api:deploy
```

`api:check` đóng gói và kiểm tra cấu hình ở chế độ dry-run. `api:deploy` xuất bản Worker `scenes-api` và tạo Durable Object dùng SQLite theo cấu hình `exports`. URL mặc định có dạng `https://scenes-api.TEN_SUBDOMAIN.workers.dev`; lấy URL thật từ kết quả deploy. Với lần deploy đầu, API trả `500` cho tới khi hai secret ở bước 3 đã được đặt.

### 3. Đặt secret và kiểm tra API

Chạy từng lệnh rồi nhập giá trị khi Wrangler hỏi; tránh ghi token hoặc mật khẩu trực tiếp vào câu lệnh:

```sh
npx wrangler secret put GITHUB_TOKEN --config server/wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD --config server/wrangler.jsonc
curl -i https://scenes-api.TEN_SUBDOMAIN.workers.dev/api/films
```

`ADMIN_PASSWORD` là mật khẩu đăng nhập website, tối thiểu 16 ký tự. Kết quả kiểm tra cần là HTTP `200` với JSON chứa `films` và `sha`. Trên Windows PowerShell, dùng `curl.exe` nếu `curl` đang trỏ tới `Invoke-WebRequest`. Xem log production bằng:

```sh
npx wrangler tail --config server/wrangler.jsonc
```

Durable Objects dùng SQLite có trên cả Workers Free và Paid; giới hạn sử dụng phụ thuộc gói. Xem [giới hạn và giá Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/).

### 4. Domain API riêng nếu cần

Có thể dùng URL `workers.dev` hoặc gắn domain API, chẳng hạn `api.nducvu.men`. Domain phải thuộc một zone đang hoạt động trên Cloudflare. Trong **Workers & Pages → scenes-api → Settings → Domains & Routes → Add → Custom Domain**, thêm domain; Cloudflare quản lý DNS và chứng chỉ HTTPS. Xem [hướng dẫn Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Nếu domain đang trỏ về Droplet, kiểm tra Worker bằng URL `workers.dev` trước. Gỡ bản ghi DNS của hostname API còn trỏ về VPS hoặc CNAME xung đột khi chuyển hostname sang Custom Domain. Nếu muốn quản lý domain bằng mã nguồn, thêm cấu hình sau ở cấp gốc của `server/wrangler.jsonc`, rồi deploy lại:

```json
{
  "routes": [
    { "pattern": "api.nducvu.men", "custom_domain": true }
  ]
}
```

### 5. Kết nối frontend GitHub Pages

Trong **Settings → Secrets and variables → Actions → Variables** của repository GitHub, đặt `VITE_API_URL` bằng URL Worker hoặc domain API riêng, không thêm `/api`. Vào **Settings → Pages → Build and deployment**, chọn **GitHub Actions**.

Workflow [.github/workflows/pages.yml](.github/workflows/pages.yml) build và xuất bản frontend khi có push vào `main`, kể cả commit cập nhật phim, hoặc khi chạy thủ công bằng `workflow_dispatch`. Workflow kiểm tra `VITE_API_URL` không rỗng và hiện đặt cố định `VITE_BASE_PATH: /`.

| URL frontend | `VITE_BASE_PATH` trong workflow | `WEB_ORIGIN` của Worker |
| --- | --- | --- |
| `https://TEN_USER.github.io/` | `/` | `https://TEN_USER.github.io` |
| `https://TEN_USER.github.io/TEN_REPOSITORY/` | `/TEN_REPOSITORY/` | `https://TEN_USER.github.io` |
| `https://example.com/` | `/` | `https://example.com` |
| `https://films.nducvu.men/` | `/` | `https://films.nducvu.men` |

`VITE_BASE_PATH` được khai báo trực tiếp trong workflow, nên cần sửa file workflow nếu thay đường dẫn; chỉ tạo Actions variable cùng tên sẽ không thay giá trị hiện tại. Sau khi thay `VITE_API_URL`, chạy lại workflow để frontend nhận cấu hình mới.

### Chuyển từ Droplet đang chạy

1. Deploy Worker, đặt secrets và xác nhận `GET /api/films` trả `200` trên URL `workers.dev`.
2. Nếu giữ domain API cũ, gắn Custom Domain vào Worker và chuyển DNS của domain đó. Nếu đổi URL API, cập nhật Actions variable `VITE_API_URL` rồi build lại frontend.
3. Kiểm tra trên website: tải danh sách, đăng nhập, lưu một thay đổi và đăng xuất. Phiên cũ của API trên Droplet không được chuyển sang Worker; đăng nhập lại sau khi đổi API.
4. Sau khi website hoạt động qua Worker, có thể dừng service `film-api` trên Droplet. Nếu VPS còn chạy dịch vụ khác thì giữ các dịch vụ đó; việc xóa Droplet thực hiện riêng trên tài khoản DigitalOcean.

Dữ liệu phim tiếp tục được lưu trong cùng repository GitHub. Khi cập nhật mã API, chạy `npm run api:deploy`; khi cập nhật secret, dùng lại `wrangler secret put`. Workflow Pages triển khai frontend, còn Worker được triển khai bằng Wrangler. Website nhận dữ liệu API trả về ngay sau khi lưu thành công.

## Dữ liệu và API

`public/films.json` là một mảng các bản ghi, ví dụ:

```json
[
  {
    "id": 1,
    "title": "Phim ví dụ",
    "director": "Tên đạo diễn",
    "year": 2026,
    "watchedOn": "12/10/2026",
    "plannedMonth": "10/2026",
    "rating": 4.5,
    "status": "watched",
    "note": "Ghi chú sau khi xem",
    "poster": "https://example.com/poster.jpg"
  }
]
```

`id` phải là số nguyên dương an toàn và duy nhất khi lưu; `year` là số nguyên từ 1888 đến 2100; `rating` nằm trong khoảng 0–5. `status` nhận `watched`, `planned` hoặc `missed`. `watchedOn` dùng ngày hợp lệ theo `dd/MM/yyyy` hoặc chuỗi rỗng; `plannedMonth` là trường tùy chọn, dùng `MM/yyyy` hoặc chuỗi rỗng. Các trường `director`, `note`, `poster` là chuỗi và có thể rỗng. Tên phim phải có nội dung, tối đa 300 ký tự; đạo diễn tối đa 300 ký tự, ghi chú 10.000 ký tự và poster 2.000 ký tự.

File dữ liệu phải tồn tại trên nhánh đã cấu hình, kể cả khi chưa có phim (nội dung `[]`). API đọc dữ liệu từ GitHub cho mỗi lần tải và trước khi ghi; không tự tạo file bị thiếu hoặc thay lỗi kết nối bằng danh sách trống.

| Phương thức | Đường dẫn | Quyền / kết quả |
| --- | --- | --- |
| `GET` | `/api/films` | Khách xem được; trả `{ films, sha }`. |
| `POST` | `/api/login` | Nhận `{ password }`; trả `{ token }` khi mật khẩu đúng. |
| `GET` | `/api/session` | Trả `{ isOwner }` theo token hiện tại. |
| `DELETE` | `/api/session` | Hủy phiên hiện tại; trả `{ ok: true }`. |
| `PUT` | `/api/films` | Cần `Authorization: Bearer <token>`; nhận toàn bộ `{ films, sha }`, tạo commit `Update film journal` và trả danh sách cùng SHA mới. |

Phiên đăng nhập có thời hạn 12 giờ. Frontend lưu token trong `sessionStorage` với khóa `scenes-owner-session`; Durable Object lưu hash của token, thời hạn và hash mật khẩu trong SQLite. Phiên còn hiệu lực sau khi Worker tải lại hoặc deploy cập nhật với cùng namespace; đăng xuất thu hồi token ngay, và thay `ADMIN_PASSWORD` sẽ vô hiệu hóa các phiên cũ. Sau 5 lần nhập sai mật khẩu liên tiếp từ cùng IP (không có khoảng nghỉ từ 15 phút trở lên), API chặn đăng nhập từ địa chỉ đó trong 15 phút. IP được lấy từ header `CF-Connecting-IP` của Cloudflare.

API nhận tối đa 2.000 phim mỗi lần lưu và giới hạn body ở 1.000.000 byte. SHA dùng để phát hiện dữ liệu đã được sửa từ phiên khác: nếu không còn khớp, API trả `409` và người dùng cần tải lại trang trước khi sửa tiếp.

## Dữ liệu cũ trong trình duyệt

Sau khi đăng nhập và tải dữ liệu API thành công, nếu danh sách chung đang trống và trình duyệt có dữ liệu hợp lệ ở khóa `localStorage` `frame-notes-films`, ứng dụng hiện nút **Nhập vào dữ liệu chung**. Dữ liệu cũ chỉ bị xóa khỏi `localStorage` sau khi API lưu thành công lên GitHub. Hãy thực hiện trên đúng trình duyệt và origin đã lưu phim trước đây.

Khi đọc dữ liệu cũ, ứng dụng tự chuyển ngày `yyyy-MM-dd` thành `dd/MM/yyyy` và tháng `yyyy-MM` thành `MM/yyyy`. Nếu danh sách chung đã có phim, ứng dụng không hiển thị nút nhập hoặc tự gộp dữ liệu cũ.

## Kiểm tra

```sh
npm run lint
npm run test
npm run build
npm run api:check
```

`lint` dùng Oxlint; `test` chạy Node test runner và Miniflare/workerd cho xử lý dữ liệu/ngày tháng, API, CORS, phiên đăng nhập bền vững và giới hạn thử mật khẩu, với các yêu cầu đến GitHub được giả lập; `build` kiểm tra TypeScript rồi tạo frontend trong `dist/`; `api:check` đóng gói Worker ở chế độ dry-run.

Để xem bản build, chạy `npm run preview`. Preview chỉ phục vụ frontend; cần API đang chạy và `WEB_ORIGIN` khớp origin preview (mặc định `http://localhost:4173`).

## Xử lý lỗi thường gặp

| Hiện tượng | Kiểm tra |
| --- | --- |
| `Chưa cấu hình VITE_API_URL.` | Điền `.env` rồi khởi động lại Vite; với Pages, đặt Actions variable và build lại. |
| `403` / `Origin not allowed` | `WEB_ORIGIN` phải khớp giao thức, domain và cổng frontend đang mở. Sửa `.dev.vars` rồi chạy lại API khi local; sửa `vars` rồi deploy lại Worker khi production. |
| `500` / `API chưa được cấu hình đúng` | Kiểm tra `vars`, binding `AUTH_STATE`, hai secret và độ dài mật khẩu; cấu hình local không tự được đưa lên production. |
| `502` / `Không thể kết nối dữ liệu` | Xem log bằng `wrangler tail`; kiểm tra token, repository, nhánh, đường dẫn file và định dạng JSON. File không tồn tại trên GitHub cũng gây lỗi này. |
| `409` / `Dữ liệu đã thay đổi` | Tải lại trang để nhận dữ liệu và SHA mới, rồi thực hiện lại thay đổi. |
| `401` khi lưu phim | Đăng nhập lại; phiên có thể đã hết hạn, mật khẩu đã đổi hoặc vừa chuyển từ API trên Droplet sang Worker. |
| `429` khi đăng nhập | Chờ hết thời gian chặn 15 phút sau nhiều lần nhập sai mật khẩu. |
| Pages không tải được CSS/JS | Đối chiếu URL frontend với `VITE_BASE_PATH` trong workflow rồi build lại. |
