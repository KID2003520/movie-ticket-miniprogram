const appConfig = require('../../utils/config.js');
const backendApi = require('../../utils/backendApi.js');

Page({
  data: {
    users: [],
    loading: true,
    hasMore: true,
    page: 1,
    pageSize: 10,
    keyword: '',
    currentLevel: '',
    currentLevelLabel: '用户等级',
    currentStatus: '',
    currentStatusLabel: '账号状态',
    currentSort: 'createTime',
    currentSortLabel: '注册时间',
    levelList: [
      { value: '', label: '全部等级' },
      { value: 'normal', label: '普通用户' },
      { value: 'vip', label: '会员' },
      { value: 'admin', label: '管理员' }
    ],
    statusList: [
      { value: '', label: '全部状态' },
      { value: 'active', label: '正常' },
      { value: 'disabled', label: '已禁用' }
    ],
    sortList: [
      { value: 'createTime', label: '注册时间' },
      { value: 'totalSpent', label: '消费金额' },
      { value: 'orderCount', label: '订单数量' }
    ],
    showConfirmModal: false,
    modalTitle: '',
    modalDesc: '',
    confirmAction: null,
    confirmData: null
  },

  onLoad: function () {
    this.loadUsers();
  },

  onShow: function () {
    this.loadUsers();
  },

  /** 筛选/排序/分页（本地 mock 与后端列表共用） */
  applyUserListPipeline: function (allUsers) {
    let filtered = [...allUsers];

    if (this.data.currentLevel) {
      filtered = filtered.filter((u) => u.level === this.data.currentLevel);
    }

    if (this.data.currentStatus) {
      filtered = filtered.filter((u) => u.status === this.data.currentStatus);
    }

    if (this.data.keyword) {
      const kw = this.data.keyword.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          (u.nickName && u.nickName.toLowerCase().includes(kw)) ||
          (u.phone && u.phone.includes(this.data.keyword))
      );
    }

    filtered.sort((a, b) => {
      if (this.data.currentSort === 'totalSpent') {
        return (b.totalSpent || 0) - (a.totalSpent || 0);
      }
      if (this.data.currentSort === 'orderCount') {
        return (b.orderCount || 0) - (a.orderCount || 0);
      }
      return new Date(b.createTime || 0) - new Date(a.createTime || 0);
    });

    const end = this.data.page * this.data.pageSize;
    const pagedUsers = filtered.slice(0, end);
    return {
      pagedUsers,
      hasMore: end < filtered.length
    };
  },

  loadUsers: function () {
    this.setData({ loading: true });
    const that = this;

    if (appConfig.USE_BACKEND_ONLY) {
      return backendApi
        .getAdminUsers()
        .then((body) => {
          const items = (body.data && body.data.items) || [];
          const allUsers = items.map((u) => ({
            ...u,
            createTime: u.createTime ? String(u.createTime).slice(0, 10) : '',
            status: u.status || 'active'
          }));
          const { pagedUsers, hasMore } = that.applyUserListPipeline(allUsers);
          that.setData({
            users: pagedUsers,
            hasMore,
            loading: false
          });
        })
        .catch((err) => {
          console.error(err);
          wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
          that.setData({ users: [], hasMore: false, loading: false });
        });
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        let allUsers = wx.getStorageSync('adminUsers') || that.getMockUsers();
        const { pagedUsers, hasMore } = that.applyUserListPipeline(allUsers);
        that.setData({
          users: pagedUsers,
          hasMore,
          loading: false
        });
        resolve();
      }, 500);
    });
  },

  getMockUsers: function () {
    const mockUsers = [
      { _id: 'user_1', nickName: '张三', phone: '13800138001', password: '123456', level: 'vip', status: 'active', totalSpent: 2580, orderCount: 12, createTime: '2023-01-15', avatarUrl: 'https://picsum.photos/100/100?random=101' },
      { _id: 'user_2', nickName: '李四', phone: '13800138002', password: '123456', level: 'normal', status: 'active', totalSpent: 680, orderCount: 5, createTime: '2023-02-20', avatarUrl: 'https://picsum.photos/100/100?random=102' },
      { _id: 'user_3', nickName: '王五', phone: '13800138003', password: '123456', level: 'normal', status: 'disabled', totalSpent: 120, orderCount: 1, createTime: '2023-03-10', avatarUrl: 'https://picsum.photos/100/100?random=103' },
      { _id: 'user_4', nickName: '管理员', phone: '13800138000', password: 'admin123', level: 'admin', status: 'active', totalSpent: 0, orderCount: 0, createTime: '2023-01-01', avatarUrl: 'https://picsum.photos/100/100?random=104' },
      { _id: 'user_5', nickName: '赵六', phone: '13800138005', password: '123456', level: 'vip', status: 'active', totalSpent: 3200, orderCount: 18, createTime: '2023-01-25', avatarUrl: 'https://picsum.photos/100/100?random=105' }
    ];
    
    wx.setStorageSync('adminUsers', mockUsers);
    return mockUsers;
  },

  onLevelChange: function (e) {
    const index = e.detail.value;
    const level = this.data.levelList[index];
    this.setData({
      currentLevel: level.value,
      currentLevelLabel: level.label,
      page: 1,
      users: []
    });
    this.loadUsers();
  },

  onStatusChange: function (e) {
    const index = e.detail.value;
    const status = this.data.statusList[index];
    this.setData({
      currentStatus: status.value,
      currentStatusLabel: status.label,
      page: 1,
      users: []
    });
    this.loadUsers();
  },

  onSortChange: function (e) {
    const index = e.detail.value;
    const sort = this.data.sortList[index];
    this.setData({
      currentSort: sort.value,
      currentSortLabel: sort.label,
      page: 1,
      users: []
    });
    this.loadUsers();
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch: function () {
    this.setData({ page: 1, users: [] });
    this.loadUsers();
  },

  onLoadMore: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadUsers();
    }
  },

  onAddUser: function () {
    wx.navigateTo({ url: '/pages/admin-user-add/admin-user-add' });
  },

  onEdit: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-user-add/admin-user-add?id=${id}` });
  },

  onToggleStatus: function (e) {
    const { id, status } = e.currentTarget.dataset;
    const action = status === 'disabled' ? '启用' : '禁用';
    
    this.setData({
      showConfirmModal: true,
      modalTitle: `确认${action}`,
      modalDesc: `确定要${action}该用户账号吗？`,
      confirmAction: 'toggleStatus',
      confirmData: { id, newStatus: status === 'disabled' ? 'active' : 'disabled' }
    });
  },

  onResetPassword: function (e) {
    const id = e.currentTarget.dataset.id;
    
    this.setData({
      showConfirmModal: true,
      modalTitle: '重置密码',
      modalDesc: '确定要将该用户密码重置为默认密码(123456)吗？',
      confirmAction: 'resetPassword',
      confirmData: { id }
    });
  },

  onDelete: function (e) {
    const id = e.currentTarget.dataset.id;
    
    this.setData({
      showConfirmModal: true,
      modalTitle: '确认删除',
      modalDesc: '将彻底删除该用户及其关联订单/收藏/评论数据，确定继续吗？',
      confirmAction: 'delete',
      confirmData: { id }
    });
  },

  onCancelModal: function () {
    this.setData({
      showConfirmModal: false,
      modalTitle: '',
      modalDesc: '',
      confirmAction: null,
      confirmData: null
    });
  },

  onConfirmModal: function () {
    const { confirmAction, confirmData } = this.data;
    
    if (confirmAction === 'toggleStatus') {
      this.doToggleStatus(confirmData.id, confirmData.newStatus);
    } else if (confirmAction === 'resetPassword') {
      this.doResetPassword(confirmData.id);
    } else if (confirmAction === 'delete') {
      this.doDelete(confirmData.id);
    }
    
    this.onCancelModal();
  },

  doToggleStatus: function (id, newStatus) {
    if (appConfig.USE_BACKEND_ONLY) {
      wx.showToast({ title: '云端模式请使用数据库维护用户状态', icon: 'none' });
      return;
    }
    const users = wx.getStorageSync('adminUsers') || [];
    const index = users.findIndex(u => u._id === id);
    
    if (index !== -1) {
      users[index].status = newStatus;
      wx.setStorageSync('adminUsers', users);
      
      wx.showToast({
        title: newStatus === 'active' ? '已启用' : '已禁用',
        icon: 'success'
      });
      
      this.setData({ page: 1, users: [] });
      this.loadUsers();
    }
  },

  doResetPassword: function (id) {
    if (appConfig.USE_BACKEND_ONLY) {
      wx.showToast({ title: '云端模式请使用数据库或后续接口重置密码', icon: 'none' });
      return;
    }
    const users = wx.getStorageSync('adminUsers') || [];
    const index = users.findIndex(u => u._id === id);
    
    if (index !== -1) {
      users[index].password = '123456';
      wx.setStorageSync('adminUsers', users);
      
      wx.showToast({
        title: '密码已重置为123456',
        icon: 'success'
      });
    }
  },

  doDelete: function (id) {
    if (appConfig.USE_BACKEND_ONLY) {
      return backendApi
        .deleteAdminUser(id)
        .then(() => {
          wx.showToast({ title: '删除成功', icon: 'success' });
          this.setData({ page: 1, users: [] });
          this.loadUsers();
        })
        .catch((err) => {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        });
    }
    let users = wx.getStorageSync('adminUsers') || [];
    users = users.filter(u => u._id !== id);
    wx.setStorageSync('adminUsers', users);
    
    wx.showToast({ title: '删除成功', icon: 'success' });
    
    this.setData({ page: 1, users: [] });
    this.loadUsers();
  }
});
