import json
import heapq

def find_shortest_path(graph_json, start_node, end_node):
    """
    使用 Dijkstra 算法查找权重最小的最优路径（如最便宜的航线）。

    参数:
        graph_json: 支持 JSON 字符串或 Python 字典对象。
                    支持邻接表格式或边列表 (edges/links) 格式。
        start_node: 起始节点 ID
        end_node: 目标节点 ID

    返回:
        list: 节点列表 [start,...,end]，若不存在路径则返回 []
    """
    # 1. 解析 JSON 数据
    if isinstance(graph_json, str):
        data = json.loads(graph_json)
    else:
        data = graph_json

    # 2. 构建统一的图结构（邻接表）
    graph = {}
    
    # 判断图是有向图还是无向图 (默认为有向图 directed=True)
    is_directed = data.get("directed", True) if isinstance(data, dict) else True

    def add_node(node):
        if node not in graph:
            graph[node] = {}

    def add_edge(u, v, weight):
        add_node(u)
        add_node(v)
        # 如果存在平行边，保留权重较小的那条
        graph[u][v] = min(graph[u].get(v, float('inf')), float(weight))
        if not is_directed:
            graph[v][u] = min(graph[v].get(u, float('inf')), float(weight))

    # 情况 A：边列表格式 {"directed": false, "edges": [{"source": 0, "target": 1, "weight": 10}, ...]}
    if isinstance(data, dict) and ("edges" in data or "links" in data):
        edges = data.get("edges") or data.get("links")
        for edge in edges:
            u = edge.get("source", edge.get("from"))
            v = edge.get("target", edge.get("to"))
            w = edge.get("weight", edge.get("cost", edge.get("price", 1)))
            add_edge(u, v, w)

    # 情况 B：邻接字典格式 {"0": {"1": 100, "2": 200}, "1": {"2": 50}}
    elif isinstance(data, dict):
        for u, neighbors in data.items():
            if u == "directed":
                continue
            add_node(u)
            if isinstance(neighbors, dict):
                for v, w in neighbors.items():
                    add_edge(u, v, w)

    # 3. 兼容 JSON 键类型（如整数 0 与字符串 "0" 的自动适配）
    def resolve_node_key(node):
        if node in graph:
            return node
        if str(node) in graph:
            return str(node)
        try:
            int_node = int(node)
            if int_node in graph:
                return int_node
        except (ValueError, TypeError):
            pass
        return node

    actual_start = resolve_node_key(start_node)
    actual_end = resolve_node_key(end_node)

    # 如果起点或终点不在图内，直接返回空列表
    if actual_start not in graph or actual_end not in graph:
        return []

    # 4. 执行 Dijkstra 算法
    distances = {node: float('inf') for node in graph}
    previous_nodes = {node: None for node in graph}
    distances[actual_start] = 0

    # 优先队列存储元组: (当前累计总权重/票价, 当前节点)
    pq = [(0, actual_start)]

    while pq:
        current_dist, current_node = heapq.heappop(pq)

        # 提前终止：如果已经到达终点，可直接跳出循环
        if current_node == actual_end:
            break

        # 如果当前路径费用大于已记录的最小费用，跳过
        if current_dist > distances[current_node]:
            continue

        # 遍历邻居节点，进行松弛操作 (Relaxation)
        for neighbor, weight in graph[current_node].items():
            distance = current_dist + weight
            if distance < distances[neighbor]:
                distances[neighbor] = distance
                previous_nodes[neighbor] = current_node
                heapq.heappush(pq, (distance, neighbor))

    # 5. 回溯构建最短路径
    if distances[actual_end] == float('inf'):
        return []  # 无法到达目标节点

    path = []
    curr = actual_end
    while curr is not None:
        path.append(curr)
        curr = previous_nodes[curr]

    path.reverse()  # 反转路径，使其从起点开始
    return path

# ==========================================
# 测试用例 1：有向图 - 中转航班比直飞更便宜
# ==========================================
# 直飞 0 -> 1 票价: 100
# 中转 0 -> 2 -> 1 票价: 20 + 30 = 50 (更便宜)
graph_directed_json = """
{
    "directed": true,
    "0": {"1": 100, "2": 20},
    "1": {"3": 40},
    "2": {"1": 30, "3": 90}
}
"""

print("Test 1 (Cheapest connecting flight):")
path1 = find_shortest_path(graph_directed_json, 0, 1)
print(f"Path 0 -> 1: {path1}")  # 预期输出: [0, 2, 1] 或 ['0', '2', '1']

path1_to_3 = find_shortest_path(graph_directed_json, 0, 3)
print(f"Path 0 -> 3: {path1_to_3}")  # 预期输出: [0, 2, 1, 3]


# ==========================================
# 测试用例 2：无向图 (Undirected Graph)
# ==========================================
graph_undirected_json = {
    "directed": False,
    "edges": [
        {"source": "A", "target": "B", "weight": 50},
        {"source": "B", "target": "C", "weight": 30},
        {"source": "A", "target": "C", "weight": 100}
    ]
}

print("\nTest 2 (Undirected graph):")
path2 = find_shortest_path(graph_undirected_json, "A", "C")
print(f"Path A -> C: {path2}")  # 预期输出: ['A', 'B', 'C']


# ==========================================
# 测试用例 3：不存在可达路径 (No Path Exists)
# ==========================================
graph_no_path_json = """
{
    "directed": true,
    "0": {"1": 10},
    "2": {"3": 15}
}
"""

print("\nTest 3 (No path exists):")
path3 = find_shortest_path(graph_no_path_json, 0, 3)
print(f"Path 0 -> 3: {path3}")  # 预期输出: []
