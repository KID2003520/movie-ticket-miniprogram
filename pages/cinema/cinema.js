Page({
  data: {
    cinemas: [],
    loading: true
  },

  onLoad: function () {
    this.loadCinemas();
  },

  loadCinemas: function () {
    const cinemas = [
      { _id: '1', name: '万达影城（万达广场店）', address: '北京市朝阳区建国路93号万达广场B1层', tags: ['IMAX', '杜比全景声'], minPrice: 35, distance: 1.2, latitude: 39.908823, longitude: 116.461312 },
      { _id: '2', name: 'CGV影城（颐堤港店）', address: '北京市朝阳区酒仙桥路18号颐堤港购物中心3层', tags: ['IMAX', '4DX'], minPrice: 38, distance: 2.5, latitude: 39.977856, longitude: 116.492315 },
      { _id: '3', name: '博纳国际影城（悠唐店）', address: '北京市朝阳区朝阳门外大街悠唐购物中心5层', tags: ['激光厅', '巨幕厅'], minPrice: 32, distance: 0.8, latitude: 39.923456, longitude: 116.442378 },
      { _id: '4', name: '金逸影城（朝阳大悦城店）', address: '北京市朝阳区朝阳北路101号朝阳大悦城9层', tags: ['IMAX'], minPrice: 36, distance: 3.1, latitude: 39.934567, longitude: 116.474589 }
    ];
    this.setData({ cinemas: cinemas, loading: false });
  },

  onCinemaTap: function (e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/cinema-detail/cinema-detail?id=${id}`
    });
  },

  onLocationTap: function (e) {
    const { latitude, longitude, name, address } = e.currentTarget.dataset;
    wx.openLocation({
      latitude: latitude,
      longitude: longitude,
      name: name,
      address: address,
      scale: 15
    });
  }
});
