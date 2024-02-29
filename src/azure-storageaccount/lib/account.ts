import { ResourceGroup } from "@cdktf/provider-azurerm/lib/resource-group";
import { StorageAccount } from "@cdktf/provider-azurerm/lib/storage-account";
import {
  StorageAccountNetworkRulesA,
  StorageAccountNetworkRulesPrivateLinkAccessA,
} from "@cdktf/provider-azurerm/lib/storage-account-network-rules";
import { StorageTableAcl } from "@cdktf/provider-azurerm/lib/storage-table";
import { Construct } from "constructs";
import { Container } from "./container";
import { FileShare, FileShareProps } from "./fileshare";
import { Queue } from "./queue";
import { Table } from "./table";
import { AzureResourceWithAlert } from "../../core-azure/lib";

export interface NetworkRulesProps {
  /**
   * Specifies which traffic to bypass from the network rules. The possible values are 'AzureServices', 'Logging', 'Metrics',
   * and 'None'. Bypassing 'AzureServices' enables Azure's internal services to access the storage account.
   */
  readonly bypass?: string[];

  /**
   * The default action of the network rule set. Options are 'Allow' or 'Deny'. Set to 'Deny' to enable network rules and restrict
   * access to the storage account. 'Allow' permits access by default.
   */
  readonly defaultAction: string;

  /**
   * An array of IP rules to allow access to the storage account. These are specified as CIDR ranges.
   * Example: ['1.2.3.4/32', '5.6.7.0/24'] to allow specific IPs/subnets.
   */
  readonly ipRules?: string[];

  /**
   * An array of virtual network subnet IDs that are allowed to access the storage account. This enables you to secure the storage
   * account to a specific virtual network and subnet within Azure.
   */
  readonly virtualNetworkSubnetIds?: string[];

  /**
   * An array of objects representing the private link access settings. Each object in the array defines the sub-resource name
   * (e.g., 'blob', 'file') and its respective private endpoint connections for the storage account.
   */
  readonly privateLinkAccess?: StorageAccountNetworkRulesPrivateLinkAccessA[];
}

export interface AccountProps {
  /**
   * The type of replication to use for the storage account. This determines how your data is replicated across Azure's infrastructure.
   * Example values: LRS (Locally Redundant Storage), GRS (Geo-Redundant Storage), RAGRS (Read Access Geo-Redundant Storage).
   */
  readonly accountReplicationType?: string;

  /**
   * The performance tier of the storage account. Determines the type of hardware and performance level.
   * Example values: Standard, Premium.
   */
  readonly accountTier?: string;

  /**
   * The Azure region in which to create the storage account.
   */
  readonly location: string;

  /**
   * The name of the storage account. Must be unique across Azure.
   */
  readonly name: string;

  /**
   * The name of the Azure resource group in which to create the storage account.
   */
  readonly resourceGroup?: ResourceGroup;

  /**
   * Tags to apply to the storage account, used for categorization and billing purposes.
   * Format: { [key: string]: string }
   */
  readonly tags?: { readonly [key: string]: string };

  /**
   * A boolean flag indicating whether to enforce HTTPS for data transfer to the storage account.
   */
  readonly enableHttpsTrafficOnly?: boolean;

  /**
   * Managed Service Identity (MSI) details. Used for enabling and managing Azure Active Directory (AAD) authentication.
   */
  readonly identity?: any; // Replace 'any' with a more specific type if available.

  /**
   * The data access tier of the storage account, which impacts storage costs and data retrieval speeds.
   * Example values: Hot, Cool.
   */
  readonly accessTier?: string;

  /**
   * A flag indicating whether the Hierarchical Namespace (HNS) is enabled, which is required for Azure Data Lake Storage Gen2 features.
   */
  readonly isHnsEnabled?: boolean;

  /**
   * The minimum TLS version to be used for securing connections to the storage account.
   * Example values: TLS1_0, TLS1_1, TLS1_2.
   */
  readonly minTlsVersion?: string;

  /**
   * A boolean flag indicating whether public network access to the storage account is allowed.
   */
  readonly publicNetworkAccessEnabled?: boolean;

  /**
   * Docs at Terraform Registry: {@link https://registry.terraform.io/providers/hashicorp/azurerm/3.92.0/docs/resources/storage_account#account_kind StorageAccount#account_kind}
   */
  readonly accountKind?: string;
}

/**
 * Represents an Azure Storage Account within a Terraform deployment.
 * This class provides methods to easily manage storage resources such as Containers,
 * File Shares, Tables, Queues, and Network Rules.
 *
 * Example usage:
 * ```typescript
 * const storageAccount = new AzureStorageAccount(this, 'storageaccount', {
 *   name: 'myStorageAccount',
 *   location: 'East US',
 *   resourceGroup: myResourceGroup,
 *   accountReplicationType: 'LRS',
 *   accountTier: 'Standard',
 *   // other properties
 * });
 * ```
 */
export class Account extends AzureResourceWithAlert {
  public readonly props: AccountProps;
  public id: string;
  public readonly name: string;
  public readonly location: string;
  public resourceGroup: ResourceGroup;
  public readonly accountKind: string;
  public readonly accountTier: string;
  private readonly containers: Map<string, Container>;
  private readonly shares: Map<string, FileShare>;
  private readonly tables: Map<string, Table>;

  /**
   * Initializes a new AzureStorageAccount.
   * @param scope The scope in which to define this construct.
   * @param id The scoped construct ID.
   * @param props Configuration properties for the Azure Storage Account.
   */
  constructor(scope: Construct, id: string, props: AccountProps) {
    super(scope, id);

    this.props = props;
    this.resourceGroup = this.setupResourceGroup(props);
    this.containers = new Map<string, Container>();
    this.shares = new Map<string, FileShare>();
    this.tables = new Map<string, Table>();
    this.name = props.name;
    this.location = props.location;

    // default Storage Account Settings
    const defaults = {
      accountReplicationType: "LRS",
      accountTier: "Standard",
      enableHttpsTrafficOnly: true,
      accessTier: "Hot",
      isHnsEnabled: true,
      minTlsVersion: "TLS1_2",
      publicnetworkAccessEnabled: false,
      ...props,
    };

    // Create the storage account
    const storageAccount = new StorageAccount(this, "storageaccount", {
      ...defaults,
      name: props.name,
      resourceGroupName: this.resourceGroup.name,
      location: props.location,
      tags: props.tags,
    });

    this.id = storageAccount.id;
    this.name = storageAccount.name;
    this.accountKind = storageAccount.accountKind;
    this.accountTier = storageAccount.accountTier;
  }

  /**
   * Adds a new container to the storage account.
   * @param name The name of the container.
   * @param containerAccessType The access type of the container (e.g., 'blob', 'private').
   * @param metadata Metadata for the container.
   * @returns The created AzureStorageContainer.
   * @throws Error if a container with the same name already exists.
   *
   * Example usage:
   * ```typescript
   * const container = storageAccount.addContainer('myContainer', 'private');
   * ```
   */
  public addContainer(
    name: string,
    containerAccessType?: string,
    metadata?: { [key: string]: string },
  ): Container {
    if (this.containers.has(name)) {
      throw new Error(`Container '${name}' already exists.`);
    }

    const newContainer = new Container(this, name, {
      name: name,
      storageAccountName: this.name,
      containerAccessType: containerAccessType || "private",
      metadata: metadata || {},
    });

    this.containers.set(name, newContainer);
    return newContainer;
  }

  /**
   * Adds a new file share to the storage account.
   * @param name The name of the file share.
   * @param props Optional properties for the file share (e.g., quota, access tier).
   * @returns The created AzureStorageShare.
   * @throws Error if a share with the same name already exists.
   *
   * Example usage:
   * ```typescript
   * const fileShare = storageAccount.addShare('myFileShare', { quota: 1024, accessTier: 'Hot' });
   * ```
   */
  public addFileShare(name: string, props?: FileShareProps): FileShare {
    if (this.shares.has(name)) {
      throw new Error(`Share '${name}' already exists.`);
    }

    const defaults = {
      quota: props?.quota || 1024,
      accessTier: props?.accessTier || "Hot",
      enabledProtocol: props?.enabledProtocol || "SMB",
      acl: props?.acl || [],
      metadata: props?.metadata || {},
    };

    const newShare = new FileShare(this, name, {
      ...defaults,
      name: name,
      storageAccountName: this.name,
    });

    this.shares.set(name, newShare);
    return newShare;
  }

  /**
   * Adds a new table to the storage account.
   * @param name The name of the table.
   * @param acl Optional access control list for the table.
   * @returns The created AzureStorageTable.
   * @throws Error if a table with the same name already exists.
   *
   * Example usage:
   * ```typescript
   * const table = storageAccount.addTable('myTable');
   * ```
   */
  public addTable(name: string, acl?: StorageTableAcl[]): Table {
    if (this.tables.has(name)) {
      throw new Error(`Table '${name}' already exists.`);
    }

    const newTable = new Table(this, name, {
      name: name,
      storageAccountName: this.name,
      acl: acl,
    });

    this.tables.set(name, newTable);
    return newTable;
  }

  /**
   * Adds a new queue to the storage account.
   * @param name The name of the queue.
   * @param metadata Optional metadata for the queue.
   * @returns The created AzureStorageQueue.
   *
   * Example usage:
   * ```typescript
   * const queue = storageAccount.addQueue('myQueue');
   * ```
   */
  public addQueue(name: string, metadata?: { [key: string]: string }): Queue {
    return new Queue(this, name, {
      name: name,
      storageAccountName: this.name,
      metadata: metadata,
    });
  }

  /**
   * Adds network rules to the storage account.
   * @param props Configuration properties for the network rules.
   * @returns The configured StorageAccountNetworkRulesA.
   *
   * Example usage:
   * ```typescript
   * storageAccount.addNetworkRules({
   *     bypass: ['AzureServices'],
   *     defaultAction: 'Deny',
   *     ipRules: ['1.2.3.4/32'],
   *     virtualNetworkSubnetIds: ['subnetId'],
   *  });
   * ```
   */
  public addNetworkRules(
    props: NetworkRulesProps,
  ): StorageAccountNetworkRulesA {
    return new StorageAccountNetworkRulesA(this, "rules", {
      storageAccountId: this.id,
      bypass: props.bypass,
      defaultAction: props.defaultAction,
      ipRules: props.ipRules,
      virtualNetworkSubnetIds: props.virtualNetworkSubnetIds,
      privateLinkAccess: props.privateLinkAccess,
    });
  }
}
