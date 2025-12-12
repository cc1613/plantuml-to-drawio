# 初喜白酒定制后台 - 业务流程图（PlantUML）

| 文档信息 | |
|---------|------|
| 创建日期 | 2025-12-12 |
| 文档版本 | V1.0 |
| 用途 | PlantUML 代码，可在 https://www.plantuml.com/plantuml 或其他工具转换为图片 |

---

## 一、订单全生命周期流程

```plantuml
@startuml 订单全生命周期
!theme plain
skinparam backgroundColor #FEFEFE
skinparam ActivityBackgroundColor #E3F2FD
skinparam ActivityBorderColor #1976D2
skinparam ActivityDiamondBackgroundColor #FFF3E0
skinparam ActivityDiamondBorderColor #F57C00

title 初喜白酒定制 - 订单全生命周期流程图

|C端用户|
start
:选择商品;
:上传定制素材;
:确认下单;

|#AntiqueWhite|B端后台|
if (支付方式?) then (全款支付)
  :待支付;
  :支付全款;
  :待审核;
else (定金支付)
  :待支付;
  :支付定金;
  :待支付尾款;
  :支付尾款;
  :待审核;
endif

partition 审核环节 {
  if (审核结果?) then (通过)
    :待分配;
  else (驳回)
    :待修改;
    |C端用户|
    :客户修改内容;
    |B端后台|
    :待审核;
    note right: 重新审核
  endif
}

partition 生产环节 {
  :分配生产任务;
  :生产中;
  note right
    生产阶段:
    制作中→质检中→打包中
  end note
  
  if (质检结果?) then (合格)
    :打包完成;
  else (不合格)
    :返工;
    note right: 回到制作中
    :重新质检;
  endif
  :待发货;
}

partition 发货环节 {
  :录入物流信息;
  :确认发货;
  :待签收;
  
  if (签收方式?) then (人工确认)
    :确认签收;
  else (自动确认)
    :N天后自动签收;
  endif
}

:已完成;
stop

@enduml
```

---

## 二、支付流程

```plantuml
@startuml 支付流程
!theme plain
skinparam backgroundColor #FEFEFE

title 支付流程图

start

:C端用户下单;

if (选择支付方式?) then (全款支付)
  :计算全款优惠(约5%);
  :支付全部金额;
  if (支付成功?) then (是)
    :订单状态→待审核;
  else (否)
    :订单状态→待支付;
    :等待重新支付;
  endif
  
else (定金+尾款)
  :计算定金金额(30%-50%);
  :支付定金;
  if (定金支付成功?) then (是)
    :订单状态→待支付尾款;
    
    :等待支付尾款;
    note right
      触发时机:
      · 用户主动支付
      · 客服催付后支付
      · 发货前必须付清
    end note
    
    if (尾款支付成功?) then (是)
      :订单状态→待审核;
    else (否)
      :继续等待或取消;
    endif
  else (否)
    :订单状态→待支付;
  endif
endif

stop

@enduml
```

---

## 三、审核流程

```plantuml
@startuml 审核流程
!theme plain
skinparam backgroundColor #FEFEFE
skinparam ActivityBackgroundColor #E8F5E9
skinparam ActivityBorderColor #388E3C

title 订单审核流程图

start

:订单进入待审核状态;
note right
  触发条件:
  全款支付成功 或
  尾款支付成功
end note

:客服查看订单详情;

partition 审核内容 {
  :1. 原始图片 - 清晰度、合规性;
  :2. AI卡通图 - 生成效果;
  :3. 文字信息 - 内容合规、格式正确;
  :4. 3D效果图 - 最终效果确认;
  :5. 收货信息 - 地址完整性;
}

if (审核结果?) then (通过)
  :记录审核人和时间;
  :订单状态→待分配;
  :进入生产排队;
  stop
  
elseif (需客户修改) then (驳回)
  :选择/填写驳回原因;
  note right
    常见原因:
    · 图片清晰度不够
    · 定制文字需调整
    · 需确认定制细节
    · 素材格式不符
  end note
  :订单状态→待修改;
  :通知客户修改;
  
  :客户修改后重新提交;
  :订单状态→待审核;
  note right: 回到审核流程
  
else (帮客户修改)
  :客服在后台修改内容;
  note right
    可修改:
    · 定制文字
    · 新郎/新娘姓名
    · 婚期日期
    · 定制备注
    
    不可修改:
    · 图片(需客户重传)
  end note
  :修改完成后审核通过;
  :订单状态→待分配;
  stop
endif

@enduml
```

---

## 四、生产流程

```plantuml
@startuml 生产流程
!theme plain
skinparam backgroundColor #FEFEFE
skinparam ActivityBackgroundColor #E1F5FE
skinparam ActivityBorderColor #0288D1

title 生产流程图

start

:审核通过，订单进入待分配;

|生产主管|
:查看待分配订单;
:分配生产任务;
note right
  分配信息:
  · 选择负责人
  · 设置紧急程度
  · 预计生产时长
end note

|生产员工|
partition 制作阶段 {
  :接收任务;
  :开始制作;
  note right
    定制生产:
    · 图案印刷
    · 文字刻印
  end note
  :更新进度→制作完成;
}

|质检员|
partition 质检阶段 {
  :质量检验;
  note right
    检验内容:
    · 外观检查
    · 内容核对
    · 质量标准
  end note
  
  if (质检结果?) then (合格)
    :更新进度→质检通过;
  else (不合格)
    :填写不合格原因;
    note right
      常见原因:
      · 印刷瑕疵/色差
      · 刻字错误/模糊
      · 产品划痕/破损
      · 包装不符要求
    end note
    :标记返工;
    :订单回到制作阶段;
    note right: 返工次数+1
    |生产员工|
    :重新制作;
    |质检员|
  endif
}

|包装员|
partition 打包阶段 {
  :产品包装;
  :贴标签;
  :入库;
  :更新进度→打包完成;
}

:订单状态→待发货;

stop

@enduml
```

---

## 五、生产异常处理流程

```plantuml
@startuml 生产异常处理
!theme plain
skinparam backgroundColor #FEFEFE
skinparam ActivityBackgroundColor #FFEBEE
skinparam ActivityBorderColor #C62828

title 生产异常处理流程图

start

:生产过程中发现异常;

:点击"异常"按钮;

:填写异常原因;
note right
  异常类型:
  · 物料缺失
  · 设备故障
  · 定制内容疑问
  · 其他突发情况
end note

:订单标记异常状态;
:生产流程暂停;

fork
  :通知生产主管;
fork again
  :订单列表显示异常标签;
end fork

partition 异常处理 {
  if (异常类型?) then (物料问题)
    :补充物料;
  elseif (设备问题) then
    :设备维修;
  elseif (内容疑问) then
    :联系客户确认;
  else (其他)
    :按实际情况处理;
  endif
}

:问题解决;
:点击"解除异常";
:订单恢复正常流程;
:继续生产;

stop

@enduml
```

---

## 六、发货流程

```plantuml
@startuml 发货流程
!theme plain
skinparam backgroundColor #FEFEFE
skinparam ActivityBackgroundColor #F3E5F5
skinparam ActivityBorderColor #7B1FA2

title 发货流程图

start

:生产打包完成;
:订单进入待发货状态;

|仓储物流|
:查看待发货订单;

if (订单支付类型?) then (定金模式)
  if (尾款是否已付?) then (已付)
    :可以发货;
  else (未付)
    :阻止发货;
    :提示"尾款未付";
    |客服|
    :联系客户催付;
    :客户支付尾款;
    |仓储物流|
  endif
else (全款模式)
  :可以发货;
endif

:录入物流信息;
note right
  必填信息:
  · 物流公司
  · 运单号
end note

:确认发货;
:订单状态→待签收;
:发送发货短信通知客户;

partition 物流跟踪 {
  :运输中;
  note right
    物流状态跟踪
    (需对接物流API)
  end note
}

if (签收方式?) then (人工确认)
  :物流显示已签收;
  :点击"确认签收";
else (自动确认)
  :发货后N天;
  note right: 默认7-15天可配置
  :系统自动确认;
endif

:订单状态→已完成;

stop

@enduml
```

---

## 七、退款流程

```plantuml
@startuml 退款流程
!theme plain
skinparam backgroundColor #FEFEFE
skinparam ActivityBackgroundColor #FFF8E1
skinparam ActivityBorderColor #FFA000

title 退款流程图

start

|C端用户|
:申请退款;
note right
  可申请退款的状态:
  · 待支付
  · 待支付尾款
  · 待审核/待修改
  · 待分配
  · 生产中
  · 待发货
  · 待签收
  · 已完成
end note

:填写退款原因;
:提交退款申请;
:退款状态→退款待审核;

|客服|
:查看退款申请;
:核实订单情况;

if (审核结果?) then (同意)
  :确认退款金额;
  note right
    退款比例参考:
    · 未生产: 100%
    · 生产中: 25%-75%
    · 待发货: 0%-25%
    · 已发货: 需退货
  end note
  :退款状态→退款中;
  
  if (是否需要退货?) then (需要)
    partition 退货流程 {
      |C端用户|
      :寄回商品;
      :填写退货物流;
      |客服|
      :收到退货;
      :检验商品;
      if (商品状态?) then (完好)
        :确认可退款;
      else (异常)
        :协商扣款金额;
      endif
    }
  else (不需要)
    :直接退款;
  endif
  
  |财务|
  :执行退款;
  :点击"确认到账";
  :退款状态→已退款;
  :订单状态→已取消;
  
  |C端用户|
  :收到退款;
  
else (拒绝)
  |客服|
  :填写拒绝原因;
  note right
    常见拒绝原因:
    · 不属于质量问题
    · 超出退款时限
    · 不符合退款条件
  end note
  :退款状态→已拒绝;
  :通知客户;
  :订单恢复正常流程;
endif

stop

@enduml
```

---

## 八、订单状态机

```plantuml
@startuml 订单状态机
!theme plain
skinparam backgroundColor #FEFEFE
skinparam StateBackgroundColor #E3F2FD
skinparam StateBorderColor #1976D2

title 订单状态机

[*] --> 待支付 : 用户下单

待支付 --> 待审核 : 全款支付成功
待支付 --> 待支付尾款 : 定金支付成功
待支付 --> 已取消 : 取消订单

待支付尾款 --> 待审核 : 尾款支付成功
待支付尾款 --> 已取消 : 退款完成

待审核 --> 待分配 : 审核通过
待审核 --> 待修改 : 审核驳回
待审核 --> 已取消 : 退款完成

待修改 --> 待审核 : 客户修改后
待修改 --> 已取消 : 退款完成

待分配 --> 生产中 : 分配任务
待分配 --> 已取消 : 退款完成

生产中 --> 待发货 : 打包完成
生产中 --> 已取消 : 退款完成
note right of 生产中
  内部阶段:
  制作中→质检中→打包中
  质检不合格可返工
end note

待发货 --> 待签收 : 确认发货
待发货 --> 已取消 : 退款完成

待签收 --> 已完成 : 确认签收/自动签收
待签收 --> 已取消 : 退款完成(需退货)

已完成 --> [*]
已取消 --> [*]

@enduml
```

---

## 九、退款状态机

```plantuml
@startuml 退款状态机
!theme plain
skinparam backgroundColor #FEFEFE
skinparam StateBackgroundColor #FFF8E1
skinparam StateBorderColor #FFA000

title 退款状态机

[*] --> 退款待审核 : 用户申请退款

退款待审核 --> 退款中 : 同意退款
退款待审核 --> 已拒绝 : 拒绝退款

退款中 --> 已退款 : 确认到账
note right of 退款中
  可能包含:
  · 等待退货
  · 退货验收
  · 财务打款
end note

已退款 --> [*]
已拒绝 --> [*] : 订单恢复正常流程

@enduml
```

---

## 十、生产阶段流转

```plantuml
@startuml 生产阶段流转
!theme plain
skinparam backgroundColor #FEFEFE
skinparam StateBackgroundColor #E1F5FE
skinparam StateBorderColor #0288D1

title 生产阶段流转状态图

[*] --> 待分配 : 审核通过

待分配 --> 制作中 : 分配任务
note right of 待分配
  生产主管操作:
  选择负责人
  设置紧急程度
end note

制作中 --> 质检中 : 制作完成
note right of 制作中
  生产员工操作:
  执行定制生产
  上传阶段照片
end note

质检中 --> 打包中 : 质检合格
质检中 --> 制作中 : 质检不合格(返工)
note right of 质检中
  质检员操作:
  检验产品质量
  标记合格/不合格
end note

打包中 --> [*] : 打包完成→待发货
note right of 打包中
  包装员操作:
  产品包装
  贴标签入库
end note

@enduml
```

---

## 十一、系统角色与权限

```plantuml
@startuml 角色权限
!theme plain
skinparam backgroundColor #FEFEFE

title 系统角色与权限关系图

actor "超级管理员" as admin
actor "运营经理" as ops
actor "客服专员" as cs
actor "生产主管" as pm
actor "生产员工" as pw
actor "仓储物流" as wh

rectangle "订单管理" as order {
  usecase "查看订单" as ov
  usecase "订单审核" as oa
  usecase "代客修改" as om
}

rectangle "生产管理" as prod {
  usecase "分配任务" as pa
  usecase "更新进度" as pu
  usecase "质检操作" as pq
}

rectangle "发货管理" as ship {
  usecase "确认发货" as sd
  usecase "物流管理" as sl
}

rectangle "退款管理" as refund {
  usecase "退款审核" as ra
  usecase "退款处理" as rp
}

rectangle "商品管理" as goods {
  usecase "商品维护" as gm
}

rectangle "运营配置" as config {
  usecase "首页配置" as hc
}

rectangle "权限管理" as perm {
  usecase "用户管理" as um
  usecase "角色管理" as rm
}

' 超级管理员 - 全部权限
admin --> ov
admin --> oa
admin --> om
admin --> pa
admin --> pu
admin --> pq
admin --> sd
admin --> sl
admin --> ra
admin --> rp
admin --> gm
admin --> hc
admin --> um
admin --> rm

' 运营经理
ops --> ov
ops --> gm
ops --> hc
ops --> ra
ops --> rp

' 客服专员
cs --> ov
cs --> oa
cs --> om
cs --> ra
cs --> rp

' 生产主管
pm --> ov
pm --> pa
pm --> pu
pm --> pq

' 生产员工
pw --> ov
pw --> pu

' 仓储物流
wh --> ov
wh --> sd
wh --> sl

@enduml
```

---

## 十二、业务时序图 - 完整订单流程

```plantuml
@startuml 完整订单时序
!theme plain
skinparam backgroundColor #FEFEFE

title 完整订单流程时序图

actor 用户 as user
participant "C端小程序" as app
participant "后台系统" as sys
actor 客服 as cs
actor 生产主管 as pm
actor 生产员工 as pw
actor 质检员 as qc
actor 仓储物流 as wh

== 下单阶段 ==
user -> app : 选择商品
user -> app : 上传定制素材
user -> app : 确认下单
app -> sys : 创建订单
sys --> app : 返回支付链接
user -> app : 完成支付
app -> sys : 支付回调
sys -> sys : 更新订单状态→待审核

== 审核阶段 ==
cs -> sys : 查看待审核订单
cs -> sys : 审核定制内容
alt 审核通过
  cs -> sys : 确认通过
  sys -> sys : 订单状态→待分配
else 需要修改
  cs -> sys : 驳回并填写原因
  sys -> app : 通知用户修改
  user -> app : 修改定制内容
  app -> sys : 重新提交
  cs -> sys : 再次审核
end

== 生产阶段 ==
pm -> sys : 查看待分配订单
pm -> sys : 分配任务给生产员工
sys -> sys : 订单状态→生产中(制作中)
pw -> sys : 开始制作
pw -> sys : 更新进度→质检中
qc -> sys : 质量检验
alt 质检合格
  qc -> sys : 确认合格
  sys -> sys : 进度→打包中
  pw -> sys : 完成打包
  sys -> sys : 订单状态→待发货
else 质检不合格
  qc -> sys : 标记不合格并填写原因
  sys -> sys : 订单返工
  pw -> sys : 重新制作
end

== 发货阶段 ==
wh -> sys : 查看待发货订单
wh -> sys : 录入物流信息
wh -> sys : 确认发货
sys -> sys : 订单状态→待签收
sys -> app : 发送发货通知
app -> user : 短信/推送通知

== 签收阶段 ==
alt 人工确认
  wh -> sys : 确认签收
else 自动确认
  sys -> sys : N天后自动签收
end
sys -> sys : 订单状态→已完成

@enduml
```

---

## 使用说明

1. **在线转换**: 
   - 访问 https://www.plantuml.com/plantuml
   - 粘贴代码块中的内容（不含 \`\`\`plantuml 标记）
   - 点击 Submit 生成图片

2. **本地工具**:
   - VS Code 安装 PlantUML 插件
   - IntelliJ IDEA 安装 PlantUML Integration 插件

3. **命令行**:
   ```bash
   java -jar plantuml.jar 文件名.puml
   ```

---

## 文档修订记录

| 版本 | 日期 | 修订内容 |
|-----|------|---------|
| V1.0 | 2025-12-12 | 初版发布，包含12个核心业务流程图 |

---

*文档结束*
