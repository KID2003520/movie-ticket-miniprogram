/** 同步自定义 tabBar 选中项（淘票票式底部导航） */
function updateTabBar(page, index) {
  if (typeof page.getTabBar !== 'function' || !page.getTabBar()) return;
  page.getTabBar().setData({ selected: index });
}

module.exports = { updateTabBar };
