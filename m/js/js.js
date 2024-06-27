$(document).ready(function () {
  //移动端菜单
  $(".menu .i_menu").click(function () {
    $(".menu_list").css({
      transform: "translate(0,0)",
      opacity: 1,
    });
    $(this).show();
    $(".menu .i_close").show();
    $(".menu .i_menu").hide();
    $(".top .bg_hover").show();
  });

  $(".menu .i_close").click(function () {
    MenuHide();
  });

  $(".top .bg_hover").click(function () {
    MenuHide();
  });

  function MenuHide() {
    $(".menu_list").css({
      transform: "translate(-260px,0)",
      opacity: 0.8,
    });
    $(".menu .i_close").hide();
    $(".menu .i_menu").show();
    $(".top .bg_hover").hide();
    $(".search_area").show();
  }
});
