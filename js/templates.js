/* Starter templates. Compact syntax: [text, ...children] */
(function (g) {
'use strict';
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const build = a => { const n = { id: uid(), text: a[0], children: a.slice(1).map(build) }; return n; };

const T = [
  { key: 'blank', name: 'Sơ đồ trống', icon: '＋', cat: 'all', layout: 'map', tree: ['Chủ đề trung tâm'] },
  { key: 'lesson', name: 'Kế hoạch bài giảng', icon: '🎓', cat: 'edu', layout: 'right', tree: ['Bài giảng: [Tên bài]',
      ['Mục tiêu (CLO)', ['Kiến thức'], ['Kỹ năng'], ['Thái độ']],
      ['Khởi động (Warm-up)', ['Câu hỏi gợi mở'], ['Hoạt động nhóm nhanh']],
      ['Nội dung chính', ['Ý 1'], ['Ý 2'], ['Ý 3']],
      ['Luyện tập', ['Cá nhân'], ['Cặp / nhóm']],
      ['Đánh giá', ['Hình thức'], ['Tiêu chí']],
      ['Bài tập về nhà']] },
  { key: 'syllabus', name: 'Đề cương học phần (CLO/PLO)', icon: '📘', cat: 'edu', layout: 'right', tree: ['Học phần: [Tên học phần]',
      ['Thông tin chung', ['Số tín chỉ'], ['Đối tượng'], ['Điều kiện tiên quyết']],
      ['Chuẩn đầu ra học phần (CLO)', ['CLO1'], ['CLO2'], ['CLO3']],
      ['Liên kết CĐR chương trình (PLO)', ['PLO1'], ['PLO2']],
      ['Nội dung theo tuần', ['Tuần 1-4'], ['Tuần 5-8'], ['Tuần 9-12'], ['Tuần 13-15']],
      ['Phương pháp dạy học'], ['Đánh giá', ['Chuyên cần'], ['Giữa kỳ'], ['Cuối kỳ']], ['Tài liệu']] },
  { key: 'study', name: 'Kế hoạch học tập', icon: '📚', cat: 'edu', layout: 'map', tree: ['Kế hoạch học tập',
      ['Mục tiêu', ['Ngắn hạn'], ['Dài hạn']], ['Môn học', ['Môn 1'], ['Môn 2'], ['Môn 3']],
      ['Lịch học', ['Sáng'], ['Chiều'], ['Tối']], ['Ôn tập', ['Từ vựng'], ['Đề mẫu']], ['Theo dõi tiến độ']] },
  { key: 'skills', name: 'Bốn kỹ năng ngôn ngữ', icon: '🗣️', cat: 'edu', layout: 'map', tree: ['Tiếng Anh',
      ['Listening', ['Nghe ý chính'], ['Nghe chi tiết']], ['Speaking', ['Phát âm'], ['Lưu loát']],
      ['Reading', ['Skimming'], ['Scanning']], ['Writing', ['Cấu trúc bài'], ['Ngữ pháp, từ vựng']]] },
  { key: 'project', name: 'Kế hoạch dự án', icon: '💼', cat: 'work', layout: 'right', tree: ['Dự án: [Tên dự án]',
      ['Mục tiêu'], ['Phạm vi'], ['Các giai đoạn', ['Khởi động'], ['Thực hiện'], ['Nghiệm thu']],
      ['Nguồn lực', ['Nhân sự'], ['Ngân sách']], ['Rủi ro'], ['Mốc thời gian']] },
  { key: 'meeting', name: 'Ghi chép cuộc họp', icon: '👥', cat: 'work', layout: 'right', tree: ['Cuộc họp: [Chủ đề]',
      ['Thông tin', ['Ngày giờ'], ['Thành phần']], ['Nội dung thảo luận', ['Vấn đề 1'], ['Vấn đề 2']],
      ['Quyết định'], ['Việc cần làm', ['Ai - làm gì - khi nào']]] },
  { key: 'strategy', name: 'Chiến lược kinh doanh', icon: '📈', cat: 'work', layout: 'map', tree: ['Chiến lược',
      ['Phân tích SWOT', ['Điểm mạnh'], ['Điểm yếu'], ['Cơ hội'], ['Thách thức']],
      ['Thị trường mục tiêu'], ['Sản phẩm / dịch vụ'], ['Kênh tiếp cận'], ['Chỉ số đo lường (KPI)']] },
  { key: 'brainstorm', name: 'Động não ý tưởng', icon: '💡', cat: 'creative', layout: 'map', tree: ['Chủ đề',
      ['Ý tưởng 1'], ['Ý tưởng 2'], ['Ý tưởng 3'], ['Câu hỏi còn bỏ ngỏ']] },
  { key: 'travel', name: 'Kế hoạch du lịch', icon: '✈️', cat: 'life', layout: 'map', tree: ['Chuyến đi',
      ['Điểm đến'], ['Lịch trình', ['Ngày 1'], ['Ngày 2'], ['Ngày 3']], ['Chi phí', ['Vé'], ['Lưu trú'], ['Ăn uống']],
      ['Đồ cần mang'], ['Giấy tờ']] },
  { key: 'growth', name: 'Phát triển bản thân', icon: '🌱', cat: 'life', layout: 'map', tree: ['Phát triển bản thân',
      ['Sức khoẻ'], ['Học tập'], ['Tài chính'], ['Các mối quan hệ'], ['Thói quen hằng ngày']] },
  { key: 'event', name: 'Tổ chức sự kiện', icon: '📅', cat: 'life', layout: 'right', tree: ['Sự kiện: [Tên]',
      ['Thời gian & địa điểm'], ['Chương trình'], ['Phân công'], ['Ngân sách'], ['Truyền thông'], ['Hậu cần']] },
  { key: 'story', name: 'Lên ý tưởng bài viết', icon: '✍️', cat: 'creative', layout: 'right', tree: ['Bài viết',
      ['Mở bài', ['Câu dẫn'], ['Luận đề']], ['Thân bài', ['Luận điểm 1'], ['Luận điểm 2'], ['Luận điểm 3']], ['Kết bài']] }
];
const CATS = [['all', 'Tất cả'], ['edu', 'Giáo dục'], ['work', 'Công việc'], ['life', 'Đời sống'], ['creative', 'Sáng tạo']];

function make(key) {
  const t = T.find(x => x.key === key) || T[0], root = build(t.tree);
  return { v: 1, id: uid(), title: t.key === 'blank' ? 'Bản đồ mới' : t.name, layout: t.layout, theme: 'flow', lineStyle: 'curve', root };
}
g.MMTemplates = { list: T, cats: CATS, make };
})(window);
