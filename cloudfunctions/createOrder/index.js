const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { scheduleId, seats, totalPrice, couponId } = event || {};
    const rows = 8;
    const cols = 12;

    if (!scheduleId) {
      return { code: -1, message: '缺少场次ID' };
    }

    if (!Array.isArray(seats) || seats.length === 0) {
      return { code: -1, message: '缺少座位信息' };
    }

    const totalPriceCents = Number(totalPrice);
    if (!Number.isFinite(totalPriceCents) || totalPriceCents < 0) {
      return { code: -1, message: '总价参数错误' };
    }

    const schedule = await db.collection('schedules').doc(scheduleId).get();
    if (!schedule.data) {
      return {
        code: -1,
        message: '场次不存在',
        data: null
      };
    }

    const orderNo = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();

    // seats 数据强制化，避免前端传入类型不一致
    const normalizedSeats = seats.map(s => ({
      row: Number(s.row),
      col: Number(s.col)
    }));

    const invalidSeat = normalizedSeats.some(s => !Number.isInteger(s.row) || !Number.isInteger(s.col));
    if (invalidSeat) {
      return { code: -1, message: '座位参数错误' };
    }
    const outOfRange = normalizedSeats.some(s => s.row < 1 || s.row > rows || s.col < 1 || s.col > cols);
    if (outOfRange) {
      return { code: -1, message: '座位范围错误' };
    }

    // 基于场次单价计算上限，用于拒绝前端篡改“抬高价格/超出合理范围”
    const baseTotalPriceCents = Number(schedule.data.price) * normalizedSeats.length;
    if (totalPriceCents > baseTotalPriceCents) {
      return { code: -1, message: '总价异常' };
    }

    // 补齐订单展示所需的电影/影院信息（云端下单后订单详情页会使用这些字段）
    const [movieRes, cinemaRes] = await Promise.all([
      db.collection('movies').doc(schedule.data.movieId).get(),
      db.collection('cinemas').doc(schedule.data.cinemaId).get()
    ]);

    const orderData = {
      _openid: openid,
      orderNo: orderNo,
      scheduleId: scheduleId,
      movieId: schedule.data.movieId,
      cinemaId: schedule.data.cinemaId,
      movieTitle: movieRes.data?.title || movieRes.data?.movieTitle || '',
      moviePoster: movieRes.data?.poster || movieRes.data?.moviePoster || '',
      cinemaName: cinemaRes.data?.name || '',
      hallName: schedule.data.hallName || '',
      date: schedule.data.date || '',
      startTime: schedule.data.startTime || '',
      seats: normalizedSeats,
      seatCount: normalizedSeats.length,
      totalPrice: totalPriceCents,
      couponId: couponId || '',
      status: 'pending',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    const result = await db.collection('orders').add({ data: orderData });

    // 条件锁座：available -> locked
    // 如果某个座位并发被抢走（更新不到 1 条），则释放已锁座并取消订单
    for (const seat of normalizedSeats) {
      const lockRes = await db.collection('seats')
        .where({
          scheduleId: scheduleId,
          row: seat.row,
          col: seat.col,
          status: 'available'
        })
        .update({
          data: {
            status: 'locked',
            orderId: result._id,
            updateTime: db.serverDate()
          }
        });

      const updated = lockRes && lockRes.stats && typeof lockRes.stats.updated === 'number'
        ? lockRes.stats.updated
        : 0;

      if (updated !== 1) {
        // 回滚：释放本订单已锁座位
        await db.collection('seats').where({ orderId: result._id }).update({
          data: { status: 'available', orderId: '', updateTime: db.serverDate() }
        });
        await db.collection('orders').doc(result._id).update({
          data: { status: 'cancelled', updateTime: db.serverDate() }
        });
        return { code: -1, message: '座位已被占用', data: null };
      }
    }

    return {
      code: 0,
      message: '订单创建成功',
      data: {
        orderId: result._id,
        orderNo: orderNo
      }
    };
  } catch (err) {
    return {
      code: -1,
      message: err.message,
      data: null
    };
  }
};
