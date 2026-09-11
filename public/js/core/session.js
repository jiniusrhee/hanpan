// 화면 사이에서 넘겨주는 임시 상태 (새로고침하면 사라져도 되는 것들)
export const session = {
  pending: null,   // 시작할 판의 설정 { gameId, game, options, seats, mode, seed, mySeat, isHost, roomCode }
};
