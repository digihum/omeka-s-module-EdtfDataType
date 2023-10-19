<?php
namespace EdtfDataType;

use Composer\Semver\Comparator;
use Doctrine\Common\Collections\Criteria;
use EdtfDataType\Form\Element\ConvertToEttf;
use Omeka\Module\AbstractModule;
use Laminas\EventManager\Event;
use Laminas\EventManager\SharedEventManagerInterface;
use Laminas\ServiceManager\ServiceLocatorInterface;
use Laminas\ModuleManager\ModuleManager;

class Module extends AbstractModule
{

    public function init(ModuleManager $moduleManager): void
    {
        require_once __DIR__ . '/vendor/autoload.php';
    }

    public function getConfig()
    {
        return include __DIR__ . '/config/module.config.php';
    }

    public function install(ServiceLocatorInterface $services)
    {
        $conn = $services->get('Omeka\Connection');
        $conn->exec('CREATE TABLE edtf_data_type_edtf (id INT AUTO_INCREMENT NOT NULL, resource_id INT NOT NULL, property_id INT NOT NULL, value VARCHAR(255) NOT NULL, INDEX IDX_C0EBD47889329D25 (resource_id), INDEX IDX_C0EBD478549213EC (property_id), INDEX property_value (property_id, value), INDEX value (value), PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB;');
        $conn->exec('ALTER TABLE edtf_data_type_edtf ADD CONSTRAINT FK_C0EBD47889329D25 FOREIGN KEY (resource_id) REFERENCES resource (id) ON DELETE CASCADE;');
        $conn->exec('ALTER TABLE edtf_data_type_edtf ADD CONSTRAINT FK_C0EBD478549213EC FOREIGN KEY (property_id) REFERENCES property (id) ON DELETE CASCADE;');
    
    }

    public function uninstall(ServiceLocatorInterface $services)
    {
        $conn = $services->get('Omeka\Connection');
        $conn->exec('DROP TABLE IF EXISTS edtf_data_type;');
    }

    public function attachListeners(SharedEventManagerInterface $sharedEventManager)
    {
        $sharedEventManager->attach(
            'Omeka\Api\Adapter\ItemAdapter',
            'api.search.query',
            [$this, 'buildQueries']
        );
        $sharedEventManager->attach(
            'Omeka\Api\Adapter\ItemAdapter',
            'api.search.query',
            [$this, 'sortQueries']
        );
        $sharedEventManager->attach(
            'Omeka\Api\Adapter\ItemAdapter',
            'api.hydrate.post',
            [$this, 'convertToEdtf'],
            100 // Set a high priority so this runs before saveEdtfData().
        );
        $sharedEventManager->attach(
            'Omeka\Api\Adapter\ItemAdapter',
            'api.hydrate.post',
            [$this, 'saveEdtfData']
        );
        $sharedEventManager->attach(
            'Omeka\Controller\Admin\Item',
            'view.sort-selector',
            [$this, 'addSortings']
        );
        $sharedEventManager->attach(
            'Omeka\Controller\Site\Item',
            'view.sort-selector',
            [$this, 'addSortings']
        );
        $sharedEventManager->attach(
            'Omeka\Controller\Admin\Item',
            'view.advanced_search',
            function (Event $event) {
                $partials = $event->getParam('partials');
                $partials[] = 'common/edtf-data-type-advanced-search';
                $event->setParam('partials', $partials);
            }
        );
        $sharedEventManager->attach(
            'Omeka\Controller\Site\Item',
            'view.advanced_search',
            function (Event $event) {
                $partials = $event->getParam('partials');
                $partials[] = 'common/edtf-data-type-advanced-search';
                $event->setParam('partials', $partials);
            }
        );
        $sharedEventManager->attach(
            'Omeka\Form\ResourceBatchUpdateForm',
            'form.add_elements',
            function (Event $event) {
                $form = $event->getTarget();
                $form->add([
                    'type' => ConvertToEdtf::class,
                    'name' => 'edtf_convert',
                ]);
            }
        );
        $sharedEventManager->attach(
            'Omeka\Api\Adapter\ItemAdapter',
            'api.preprocess_batch_update',
            function (Event $event) {
                $data = $event->getParam('data');
                $rawData = $event->getParam('request')->getContent();
                if ($this->convertToEdtfDataIsValid($rawData)) {
                    $data['edtf_convert'] = $rawData['edtf_convert'];
                }
                $event->setParam('data', $data);
            }
        );
    }

    /**
     * Convert property values to the specified edtf data type.
     *
     * This will work for Item, ItemSet, and Media resources.
     *
     * @param Event $event
     */
    public function convertToEdtf(Event $event)
    {
        $entity = $event->getParam('entity');
        if ($entity instanceof \Omeka\Entity\Item) {
            $resource = 'items';
        } elseif ($entity instanceof \Omeka\Entity\ItemSet) {
            $resource = 'item_sets';
        } elseif ($entity instanceof \Omeka\Entity\Media) {
            $resource = 'media';
        } else {
            return; // This is not a resource entity.
        }

        $data = $event->getParam('request')->getContent();
        if (!$this->convertToEdtfDataIsValid($data)) {
            return; // This is not a convert-to-edtf request.
        }

        $propertyId = (int) $data['edtf_convert']['property'];
        $type = $data['edtf_convert']['type'];

        $services = $this->getServiceLocator();
        $entityManager = $services->get('Omeka\EntityManager');
        $dataType = $services->get('Omeka\DataTypeManager')->get($type);
        $adapter = $services->get('Omeka\ApiAdapterManager')->get($resource);
        $logger = $services->get('Omeka\Logger');

        // Get the property entity.
        $dql = 'SELECT p FROM Omeka\Entity\Property p WHERE p.id = :id';
        $property = $entityManager->createQuery($dql)
            ->setParameter('id', $propertyId)
            ->getOneOrNullResult();
        if (null === $property) {
            return; // The property doesn't exist. Do nothing.
        }

        // Only convert literal values of the specified property.
        $criteria = Criteria::create()
            ->where(Criteria::expr()->eq('property', $property))
            ->andWhere(Criteria::expr()->eq('type', 'literal'));
        $values = $entity->getValues()->matching($criteria);
        foreach ($values as $value) {
            $valueObject = ['@value' => $value->getValue()];
            if ($dataType->isValid($valueObject)) {
                $value->setType($type);
                $dataType->hydrate($valueObject, $value, $adapter);
            } else {
                $message = sprintf(
                    'EdtfDataType - invalid %s value for ID %s - %s', // @translate
                    $type, $entity->getId(), $value->getValue()
                );
                $logger->notice($message);
            }
        }
    }

    /**
     * Save edtf data to the corresponding number tables.
     *
     * This clears all existing numbers and (re)saves them during create and
     * update operations for a resource (item, item set, media). We do this as
     * an easy way to ensure that the numbers in the number tables are in sync
     * with the numbers in the value table.
     *
     * This will work for Item, ItemSet, and Media resources.
     *
     * @param Event $event
     */
    public function saveEdtfData(Event $event)
    {
 
        $entity = $event->getParam('entity');
        
        if (!$entity instanceof \Omeka\Entity\Resource) {
            return; // This is not a resource entity.
        }

        $allValues = $entity->getValues();


        foreach ($this->getEdtfDataType() as $dataTypeName => $dataType) {
            $criteria = Criteria::create()
                ->where(Criteria::expr()
                ->eq('type', $dataTypeName));
            
            $matchingValues = $allValues->matching($criteria);

            if (!$matchingValues) {
                // This resource has no number values of this type.
                continue;
            }

            $em = $this->getServiceLocator()->get('Omeka\EntityManager');
            $existingNumbers = [];

            if ($entity->getId()) {
                $dql = sprintf(
                    'SELECT n FROM %s n WHERE n.resource = :resource',
                    $dataType->getEntityClass()
                );
                #echo($dql);
                $query = $em->createQuery($dql);
                $query->setParameter('resource', $entity);
                $existingNumbers = $query->getResult();
            }
            foreach ($matchingValues as $value) {
                // Avoid ID churn by reusing number rows.
                $number = current($existingNumbers);
                if ($number === false) {
                    // No more number rows to reuse. Create a new one.
                    $entityClass = $dataType->getEntityClass();
                    $number = new $entityClass;
                    $em->persist($number);
                } else {
                    // Null out numbers as we reuse them. Note that existing
                    // numbers are already managed and will update during flush.
                    $existingNumbers[key($existingNumbers)] = null;
                    next($existingNumbers);
                }
                $number->setResource($entity);
                $number->setProperty($value->getProperty());
                $dataType->setEntityValues($number, $value);
            }
            // Remove any numbers that weren't reused.
            foreach ($existingNumbers as $existingNumber) {
                if (null !== $existingNumber) {
                    $em->remove($existingNumber);
                }
            }
        }
    }

    /**
     * Build edtf queries.
     *
     * @param Event $event
     */
    public function buildQueries(Event $event)
    {
        $query = $event->getParam('request')->getContent();
        if (!isset($query['edtf'])) {
            return;
        }
        $adapter = $event->getTarget();
        $qb = $event->getParam('queryBuilder');
        foreach ($this->getEdtfDataType() as $dataType) {
            $dataType->buildQuery($adapter, $qb, $query);
        }
    }

    /**
     * Sort edtfal queries.
     *
     * sort_by=edtf:<type>:<propertyId>
     *
     * @param Event $event
     */
    public function sortQueries(Event $event)
    {
        $adapter = $event->getTarget();
        $qb = $event->getParam('queryBuilder');
        $query = $event->getParam('request')->getContent();

        if (!isset($query['sort_by']) || !is_string($query['sort_by'])) {
            return;
        }
        $sortBy = explode(':', $query['sort_by']);
        if (3 !== count($sortBy)) {
            return;
        }
        [$namespace, $type, $propertyId] = $sortBy;
        if ('edtf' !== $namespace || !is_string($type) || !is_edtf($propertyId)) {
            return;
        }
        foreach ($this->getEdtfDataType() as $dataType) {
            $dataType->sortQuery($adapter, $qb, $query, $type, $propertyId);
        }
    }

    /**
     * Add edtf sort options to sort by form.
     *
     * @param Event $event
     */
    public function addSortings(Event $event)
    {
        $services = $this->getServiceLocator();
        $translator = $services->get('MvcTranslator');
        $entityManager = $services->get('Omeka\EntityManager');

        $qb = $entityManager->createQueryBuilder();
        $qb->select(['p.id', 'p.label', 'rtp.dataType'])
            ->from('Omeka\Entity\ResourceTemplateProperty', 'rtp')
            ->innerJoin('rtp.property', 'p');
        $qb->andWhere($qb->expr()->isNotNull('rtp.dataType'));
        $query = $qb->getQuery();

        $edtfDataType = $this->getEdtfDataType();
        $edtfSortBy = [];
        foreach ($query->getResult() as $templatePropertyData) {
            $dataType = $templatePropertyData['dataType'] ?? [];
            foreach ($dataType as $dataType) {
                if (isset($edtfDataType[$dataType])) {
                    $value = sprintf('%s:%s', $dataType, $templatePropertyData['id']);
                    if (!isset($edtfSortBy[$value])) {
                        $edtfSortBy[$value] = sprintf('%s (%s)', $translator->translate($templatePropertyData['label']), $dataType);
                    }
                }
            }
        }
        // Sort options alphabetically.
        asort($edtfSortBy);
        $sortConfig = $event->getParam('sortConfig') ?: [];
        $sortConfig = array_merge($sortConfig, $edtfSortBy);
        $event->setParam('sortConfig', $sortConfig);
    }

    /**
     * Get all data type added by this module.
     * @todo look at whether this can be done simpler as there is only one
     *
     * @return array
     */
    public function getEdtfDataType()
    {

        $dataType = $this->getServiceLocator()->get('Omeka\DataTypeManager');
        $edtfDataType = [];
        $edtfDataType["edtf:date"] = $dataType->get("edtf:date");
        
        return $edtfDataType;
    }

    /**
     * Does the passed data contain valid convert-to-edtf data?
     *
     * @param array $data
     * return bool
     */
    public function convertToEdtfDataIsValid(array $data)
    {
        $validType = array_keys($this->getEdtfDataType());
        return (
            isset($data['edtf_convert']['property'])
            && is_edtf($data['edtf_convert']['property'])
            && isset($data['edtf_convert']['type'])
            && in_array($data['edtf_convert']['type'], $validType)
        );
    }
}
