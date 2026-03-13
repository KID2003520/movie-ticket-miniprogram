Page({
  data: {
    isEdit: false,
    userId: '',
    showPassword: false,
    phoneError: '',
    form: {
      nickName: '',
      phone: '',
      password: '',
      level: 'normal',
      status: 'active',
      createTime: '',
      totalSpent: 0,
      orderCount: 0
    }
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ isEdit: true, userId: options.id });
      this.loadUserData(options.id);
      wx.setNavigationBarTitle({ title: '编辑用户' });
    } else {
      wx.setNavigationBarTitle({ title: '添加用户' });
      this.setData({ 'form.password': this.generatePassword() });
    }
  },

  loadUserData: function (id) {
    const users = wx.getStorageSync('adminUsers') || [];
    const user = users.find(u => u._id === id);
    
    if (user) {
      this.setData({
        form: {
          nickName: user.nickName || '',
          phone: user.phone || '',
          password: user.password || '',
          level: user.level || 'normal',
          status: user.status || 'active',
          createTime: user.createTime || '',
          totalSpent: user.totalSpent || 0,
          orderCount: user.orderCount || 0
        }
      });
    }
  },

  generatePassword: function () {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  },

  onNickNameInput: function (e) {
    this.setData({ 'form.nickName': e.detail.value });
  },

  onPhoneInput: function (e) {
    const phone = e.detail.value;
    let phoneError = '';
    
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      phoneError = '请输入正确的手机号格式';
    }
    
    this.setData({ 
      'form.phone': phone,
      phoneError: phoneError
    });
  },

  onPasswordInput: function (e) {
    this.setData({ 'form.password': e.detail.value });
  },

  onTogglePassword: function () {
    this.setData({ showPassword: !this.data.showPassword });
  },

  onGeneratePassword: function () {
    const newPassword = this.generatePassword();
    this.setData({ 'form.password': newPassword });
    
    wx.showToast({
      title: '已生成新密码',
      icon: 'success'
    });
  },

  onLevelChange: function (e) {
    const level = e.currentTarget.dataset.level;
    this.setData({ 'form.level': level });
  },

  onStatusChange: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ 'form.status': status });
  },

  validateForm: function () {
    const { form, phoneError } = this.data;
    const errors = [];

    if (!form.nickName.trim()) {
      errors.push('请输入用户名');
    }
    if (!form.phone) {
      errors.push('请输入手机号');
    } else if (!/^1[3-9]\d{9}$/.test(form.phone)) {
      errors.push('请输入正确的手机号格式');
    }
    if (!form.password) {
      errors.push('请输入密码');
    } else if (form.password.length < 6) {
      errors.push('密码至少6位');
    }

    if (errors.length > 0) {
      wx.showToast({
        title: errors[0],
        icon: 'none'
      });
      return false;
    }

    return true;
  },

  onSubmit: function () {
    if (!this.validateForm()) return;

    wx.showLoading({ title: '保存中...' });

    setTimeout(() => {
      const { form, isEdit, userId } = this.data;
      const users = wx.getStorageSync('adminUsers') || [];

      const userData = {
        _id: isEdit ? userId : 'user_' + Date.now(),
        nickName: form.nickName.trim(),
        phone: form.phone,
        password: form.password,
        level: form.level,
        status: form.status,
        avatarUrl: 'https://picsum.photos/100/100?random=' + Math.floor(Math.random() * 200),
        createTime: isEdit ? form.createTime : new Date().toISOString().split('T')[0],
        totalSpent: form.totalSpent || 0,
        orderCount: form.orderCount || 0
      };

      if (isEdit) {
        const index = users.findIndex(u => u._id === userId);
        if (index !== -1) {
          users[index] = userData;
        }
      } else {
        const existingUser = users.find(u => u.phone === form.phone);
        if (existingUser) {
          wx.hideLoading();
          wx.showToast({
            title: '该手机号已存在',
            icon: 'none'
          });
          return;
        }
        users.unshift(userData);
      }

      wx.setStorageSync('adminUsers', users);

      wx.hideLoading();
      wx.showToast({
        title: isEdit ? '修改成功' : '添加成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }, 500);
  },

  onCancel: function () {
    wx.navigateBack();
  }
});
