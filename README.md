# Ôn Writing: IELTS Task 1, Task 2, GRE

Web tra cứu tĩnh để ôn Writing. Chỉ để đọc và tự kiểm tra: không đăng nhập, không backend, không lưu tiến độ.

Web: https://buiducthinh4869.github.io/writing-reference/

## Cấu trúc thư mục

```
index.html      khung trang
style.css       giao diện (sáng/tối theo hệ thống, mobile, in)
app.js          nạp dữ liệu, định tuyến, hiển thị, tìm kiếm
data/
  task1.json    IELTS Writing Task 1
  task2.json    IELTS Writing Task 2
  gre.json      GRE Writing (Issue)
```

Toàn bộ nội dung nằm trong `data/*.json`. Code chỉ hiển thị đúng như dữ liệu. Muốn sửa hay thêm nội dung thì sửa JSON, không cần động vào code.

## Cấu trúc dữ liệu

Mỗi file là một mục:

```
{ id, title, description, groups: [{id, title}], pages: [Page] }

Page = {
  id,                       // dùng trong đường dẫn: #/task1/<id>
  group,                    // id của một nhóm trong groups (thanh bên xếp trang theo thứ tự groups)
  title, summary,
  source: "course" | "supplement",
  uses?: [sectionId],       // trang dùng chung, vd ["task2", "gre"] -> hiện "Dùng cho: Task 2, GRE"
  blocks: [Block]
}
```

Mọi block có `kind`; có thể có `title`, `core: true` (thuộc phần lõi, hiện khi bật "Trước khi viết"), `source: "supplement"` (hiện badge "bổ sung").

| kind | Trường | Hiển thị |
|---|---|---|
| `text` | `md` | Một đoạn văn |
| `list` | `items: [md]` | Danh sách gạch đầu dòng |
| `steps` | `items: [{title, md}]` | Danh sách đánh số, tiêu đề đậm |
| `table` | `columns`, `rows` | Bảng; trên điện thoại cuộn ngang |
| `phrases` | `items: [{en, vi, example?, note?, heavy?, tags?}]` | Thẻ cụm từ. `heavy: true` hiện badge "nặng"; `tags` hiện nhãn nhỏ |
| `frames` | `items: [{frame, example?, note?}]` | Khung câu (chữ đơn cách), ví dụ bên dưới |
| `pitfalls` | `items: [{wrong, right, why}]` | ✗ sai → ✓ đúng → lý do |
| `essay` | `prompt`, `figure?`, `data?`, `paragraphs: [{label, en}]`, `note?` | Đề bài, hình đề bài (SVG), số liệu, các đoạn có nhãn, số từ, ghi chú phân tích |

`figure.type`: `line` (`x`, `series: [{name, values}]`, `yMax?`), `hbar` (`categories`, `series`, `unit?`, `xMax?`), `table` (`columns`, `rows`), `multi` (`charts: [figure]`), `process` (`steps: [{label, sub?}]`), `cycle` (`steps: [{label, sub?, next?}]`), `map` (`panels: [{title, items}]`, toạ độ 300x240). Số liệu trong `figure` phải khớp bài mẫu.
| `checklist` | `items: [md]` | Ô tick (chỉ trong phiên, không lưu) |
| `scale` | `levels: [{label, words}]`, `note?` | Thang ngang từ nhỏ đến lớn |
| `links` | `items: [{label, section, page}]` | Liên kết sang trang khác |

Các trường chữ hỗ trợ markdown tối giản: `**đậm**`, `*nghiêng*`. HTML trong dữ liệu được hiện nguyên dạng chữ (đã escape).

Gặp `kind` hoặc trường lạ, web hiện nội dung dạng chữ đơn giản và ghi cảnh báo `[Ôn Writing] ...` ra console (F12), không làm hỏng trang.

## Thêm trang mới

1. Mở file của mục, vd `data/task1.json`.
2. Thêm một object vào `pages` với `id` chưa dùng và `group` có trong `groups` (muốn nhóm mới thì thêm vào `groups`; thứ tự trong `groups` là thứ tự trên thanh bên).
3. Thêm các block. Đánh `"core": true` cho các block cần liếc trước khi viết.
4. Chạy thử cục bộ (bên dưới), mở trang mới, xem console không có cảnh báo.

Thêm một mục mới (file JSON thứ tư): tạo `data/<id>.json` và thêm một dòng `{ id: '<id>', short: '<tên ngắn>' }` vào mảng `SECTIONS` đầu `app.js`. Muốn màu nhấn riêng thì thêm biến màu trong `style.css` (tìm `--c-gre`).

## Tính năng

- Điều hướng: thanh trên chuyển mục, thanh bên theo nhóm (trên điện thoại là menu gập), nút trang trước / sau. Đường dẫn dạng `#/task1/change-over-time`.
- Tìm kiếm (biểu tượng kính lúp hoặc phím `/`): tìm trong `en`, `vi`, `frame`, `example`, `wrong`, `right` và tiêu đề trang của cả 3 mục; gõ có dấu hay không dấu đều được.
- Tự kiểm tra: ẩn `en` của cụm từ và `frame` của khung câu, ví dụ hiện ở dạng đã che chỗ trùng với đáp án (nếu không che được thì ẩn ví dụ). Bấm vào thẻ để xem đáp án.
- Trước khi viết: công tắc trên mỗi trang, chỉ hiện block `core: true`.
- In (Ctrl+P): bản in gọn, ẩn điều hướng và công tắc, luôn hiện đáp án. Bật "Trước khi viết" trước khi in để có cheat sheet chỉ gồm phần lõi.

## Chạy thử cục bộ

Trình duyệt chặn `fetch` khi mở file trực tiếp, nên cần một máy chủ tĩnh:

```
cd writing-web
python -m http.server 8000
```

rồi mở http://localhost:8000.

## Cập nhật web

Sửa file, rồi:

```
git add -A
git commit -m "Cập nhật nội dung"
git push
```

GitHub Pages tự cập nhật sau khoảng 1 phút.
