Page({
  data: {
    faqList: [
      {
        id: 1,
        question: '如何购买电影票？',
        answer: '选择电影 → 选择影院 → 选择场次 → 选座 → 支付',
        isOpen: false
      },
      {
        id: 2,
        question: '如何取消订单？',
        answer: '在订单详情页，未支付的订单可以直接取消，已支付的订单可以申请退款。',
        isOpen: false
      },
      {
        id: 3,
        question: '如何使用优惠券？',
        answer: '在支付页面，系统会自动显示可用的优惠券，选择后即可抵扣相应金额。',
        isOpen: false
      },
      {
        id: 4,
        question: '如何联系影院？',
        answer: '在影院详情页可以查看影院联系方式，也可以点击地图导航到影院。',
        isOpen: false
      },
      {
        id: 5,
        question: '取票码在哪里查看？',
        answer: '支付成功后，在订单详情页会显示取票二维码，凭此码到影院取票。',
        isOpen: false
      }
    ],
    contactList: [
      { icon: '📞', title: '客服热线', content: '400-123-4567', action: 'call' },
      { icon: '💬', title: '在线客服', content: '9:00-22:00', action: 'chat' },
      { icon: '📧', title: '邮箱反馈', content: 'service@taopiaopiao.com', action: 'email' }
    ]
  },

  onToggleFAQ(e) {
    const id = e.currentTarget.dataset.id;
    const faqList = this.data.faqList.map(item => {
      if (item.id === id) {
        return { ...item, isOpen: !item.isOpen };
      }
      return item;
    });
    this.setData({ faqList });
  },

  onContactTap(e) {
    const action = e.currentTarget.dataset.action;
    const content = e.currentTarget.dataset.content;
    
    switch (action) {
      case 'call':
        wx.makePhoneCall({
          phoneNumber: content,
          fail: () => {
            wx.showToast({ title: '拨打电话失败', icon: 'none' });
          }
        });
        break;
      case 'chat':
        wx.showModal({
          title: '在线客服',
          content: '在线客服功能开发中，请拨打客服热线',
          showCancel: false
        });
        break;
      case 'email':
        wx.setClipboardData({
          data: content,
          success: () => {
            wx.showToast({ title: '邮箱已复制', icon: 'success' });
          }
        });
        break;
    }
  },

  onFeedbackTap() {
    wx.showModal({
      title: '意见反馈',
      content: '感谢您的反馈，我们会认真对待每一条意见',
      showCancel: false
    });
  }
});
