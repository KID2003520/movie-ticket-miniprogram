Page({
  data: {
    cinema: null,
    schedules: [],
    dateList: [],
    currentDateIndex: 0,
    loading: true
  },

  onLoad: function (options) {
    const { id } = options;
    this.cinemaId = id;
    this.generateDateList();
    this.loadCinemaDetail();
  },

  generateDateList: function () {
    const dateList = [];
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekDay = weekDays[date.getDay()];
      dateList.push({
        date: `${month}月${day}日`,
        weekDay: i === 0 ? '今天' : i === 1 ? '明天' : weekDay,
        fullDate: `${date.getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      });
    }
    this.setData({ dateList: dateList });
  },

  loadCinemaDetail: function () {
    const cinema = {
      _id: this.cinemaId || '1',
      name: '万达影城（万达广场店）',
      address: '北京市朝阳区建国路93号万达广场B1层',
      phone: '010-85588388',
      latitude: 39.908823,
      longitude: 116.461312,
      tags: ['IMAX', '杜比全景声', 'VIP厅']
    };
    const schedules = [
      { _id: '1', movieTitle: '流浪地球2', moviePoster: 'https://picsum.photos/300/420?random=91', hallName: 'IMAX厅', hallType: 'IMAX', startTime: '14:30', endTime: '17:23', price: 68, date: '2023-01-22' },
      { _id: '2', movieTitle: '满江红', moviePoster: 'https://picsum.photos/300/420?random=92', hallName: '杜比厅', hallType: '杜比全景声', startTime: '16:00', endTime: '18:39', price: 58, date: '2023-01-22' },
      { _id: '3', movieTitle: '熊出没·伴我熊芯', moviePoster: 'https://picsum.photos/300/420?random=93', hallName: '3号厅', hallType: '3D', startTime: '10:30', endTime: '12:07', price: 38, date: '2023-01-22' }
    ];
    this.setData({ cinema: cinema, schedules: schedules, loading: false });
    wx.setNavigationBarTitle({ title: cinema.name });
  },

  onDateChange: function (e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ currentDateIndex: index });
  },

  onScheduleTap: function (e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/seat-selection/seat-selection?id=${id}` });
  },

  onLocationTap: function () {
    if (this.data.cinema) {
      wx.openLocation({
        latitude: this.data.cinema.latitude,
        longitude: this.data.cinema.longitude,
        name: this.data.cinema.name,
        address: this.data.cinema.address,
        scale: 15
      });
    }
  }
});
