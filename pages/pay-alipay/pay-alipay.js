Page({
  data: {
    url: ''
  },

  onLoad(query) {
    const raw = query.url ? decodeURIComponent(query.url) : '';
    this.setData({ url: raw });
  }
});
